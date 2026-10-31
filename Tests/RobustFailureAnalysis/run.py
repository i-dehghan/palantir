"""DIDEBAN 3.1.7.14: aggregate-only synthetic OOD failure audit.

Consumes frozen reports; does not train, tune, access raw records or identify people.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path

EXPECTED = {'temporal': '3.1.7.11', 'diagnostics': '3.1.7.12', 'ood': '3.1.7.13'}
METRICS = ('rocAuc', 'prAuc', 'brier', 'precision', 'recall', 'f1')


def read_report(path: Path, phase: str) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    with path.open('r', encoding='utf-8') as stream:
        data = json.load(stream)
    if data.get('phase') != phase or data.get('readOnly') is not True:
        raise ValueError(f'Invalid phase/read-only declaration: {path}')
    return data


def finite_number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'Invalid numeric field: {name}')
    return float(value)


def validate_confusion(case, name):
    m = case['selectedThreshold']
    cm = m['confusionMatrix']
    for key in ('TN', 'FP', 'FN', 'TP'):
        if type(cm.get(key)) is not int or cm[key] < 0:
            raise ValueError(f'Invalid confusion matrix: {name}.{key}')
    n = sum(cm.values())
    if n != case['rows'] or cm['TP'] + cm['FN'] != case['positives']:
        raise ValueError(f'Confusion totals disagree: {name}')
    for key in METRICS:
        v = finite_number(m[key], f'{name}.{key}')
        if not 0 <= v <= 1:
            raise ValueError(f'Metric outside [0,1]: {name}.{key}')
    tp, fp, fn = cm['TP'], cm['FP'], cm['FN']
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    if abs(precision - m['precision']) > 2e-6 or abs(recall - m['recall']) > 2e-6:
        raise ValueError(f'Confusion-derived metrics disagree: {name}')
    return cm


def identical_summary_columns(distributions, a, b):
    keys = ('mean', 'std', 'median', 'p05', 'p95', 'zeroRate', 'uniqueValues')
    return all(all(distributions[split][a][key] == distributions[split][b][key] for key in keys)
               for split in ('train', 'calibratorFit', 'policySelection', 'test'))


def audit(temporal, diagnostics, ood, min_precision=.8):
    if any(doc.get('readOnly') is not True for doc in (temporal, diagnostics, ood)):
        raise ValueError('All source reports must declare readOnly=true')
    if temporal['rows'] != diagnostics['rows'] or any(
        temporal['splits'][s]['rows'] != diagnostics['splitSizes'][s]
        for s in ('train', 'calibratorFit', 'policySelection', 'test')
    ):
        raise ValueError('Temporal and diagnostic split sizes disagree')
    frozen = ood['frozenSpecification']
    if frozen.get('noOodTuning') is not True or frozen.get('feature') != 'log1p(duration_seconds)' or frozen.get('calibration') != 'isotonic':
        raise ValueError('OOD model is not the expected frozen duration-only specification')
    if diagnostics['candidateForFutureIndependentEvaluation'] != 'duration_only':
        raise ValueError('Selected diagnostic candidate differs from frozen OOD model')
    policy = diagnostics['policyOnlyAblations']['duration_only']
    if not math.isclose(finite_number(frozen['threshold'], 'frozen.threshold'), finite_number(policy['selectedThreshold'], 'policy.threshold'), abs_tol=1e-8):
        raise ValueError('Frozen threshold does not match policy report')
    if diagnostics['testEvaluationPerformed'] is not False:
        raise ValueError('Diagnostic report must not use test evaluation')
    if not 0 < min_precision <= 1:
        raise ValueError('minimum precision must be in (0,1]')

    source_metrics = temporal['baselineDurationOnly']['testAtSelectedThreshold']
    cases = {}
    for name in ('overlap', 'inversion'):
        case = ood['cases'][name]
        cm = validate_confusion(case, name)
        metrics = case['selectedThreshold']
        cases[name] = {
            'sampleCount': case['rows'],
            'positivePrevalence': round(case['positives'] / case['rows'], 6),
            'metricsAtFrozenThreshold': {key: metrics[key] for key in METRICS},
            'deltaVsTemporalTest': {key: round(metrics[key] - source_metrics[key], 6) for key in METRICS},
            'confusionMatrix': cm,
            'falseNegativeRate': round(cm['FN'] / (cm['FN'] + cm['TP']), 6),
            'falsePositiveRate': round(cm['FP'] / (cm['FP'] + cm['TN']), 6),
            'precisionConstraintMet': metrics['precision'] >= min_precision,
            'durationLogMeanByLabel': case['durationLogMeanByLabel'],
        }

    distributions = diagnostics['featureDistributions']
    names = diagnostics['featureNames']
    all_zero = [feature for feature in names if all(
        distributions[split][feature]['zeroRate'] == 1.0
        for split in ('train', 'calibratorFit', 'policySelection', 'test'))]
    summary_equivalent = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if a not in all_zero and b not in all_zero and identical_summary_columns(distributions, a, b):
                summary_equivalent.append([a, b])
    shift = diagnostics['standardizedMeanShiftVsTrain']['test']
    shifted = [{'feature': key, 'standardizedMeanShift': value}
               for key, value in sorted(shift.items(), key=lambda item: -item[1]) if value >= .5]
    eligible = [key for key, item in diagnostics['policyOnlyAblations'].items()
                if item['policyPrecisionConstraintFeasible']]
    return {
        'phase': '3.1.7.14', 'status': 'AGGREGATE_SYNTHETIC_FAILURE_AUDIT',
        'readOnly': True, 'minimumPrecision': min_precision,
        'sourceTemporalTest': {key: source_metrics[key] for key in METRICS},
        'frozenModel': {'feature': frozen['feature'], 'calibration': frozen['calibration'], 'threshold': frozen['threshold']},
        'oodCases': cases,
        'featureAudit': {
            'allZeroFeaturesBySummary': all_zero,
            'identicalDistributionSummariesNotProvenRowDuplicates': summary_equivalent,
            'largeTestVsTrainStandardizedMeanShifts': shifted,
            'policyFeasibleCandidates': eligible,
            'policySelectedCandidate': diagnostics['candidateForFutureIndependentEvaluation'],
        },
        'decision': {
            'operationalDeployment': 'NO_GO',
            'reason': 'Frozen model fails minimum precision in predeclared synthetic OOD cases',
            'noRetrainingOrThresholdSelection': True,
            'nextExperiment': 'Create a NEW pre-registered synthetic multi-environment fixture with non-label-derived topology, nonzero repeated-pair activity, and an untouched final environment; develop only on separate environments.',
        },
        'limitations': [
            'Aggregate reports cannot establish row-wise duplicate features or individual errors.',
            'Synthetic scenario labels are not evidence of real misconduct.',
            'OOD scenarios are designed stress tests, not representative field prevalence.',
            'Differences in prevalence and label mechanisms limit direct cross-environment comparisons.',
            'No test/OOD-driven tuning, no production deployment, no raw personal records accessed.',
        ],
    }


def safe_output(out: Path, inputs):
    resolved = out.resolve()
    if any(resolved == p.resolve() for p in inputs):
        raise ValueError('Output must not overwrite an input report')
    if resolved.exists():
        raise FileExistsError(f'Output already exists: {resolved}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--temporal', type=Path, required=True)
    parser.add_argument('--diagnostics', type=Path, required=True)
    parser.add_argument('--ood', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    paths = [args.temporal, args.diagnostics, args.ood]
    safe_output(args.out, paths)
    docs = [read_report(p, EXPECTED[k]) for p, k in zip(paths, ('temporal', 'diagnostics', 'ood'))]
    result = audit(*docs)
    result['sourceSha256'] = {k: hashlib.sha256(p.read_bytes()).hexdigest()
                              for k, p in zip(('temporal', 'diagnostics', 'ood'), paths)}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(f'Wrote {args.out} | deployment={result["decision"]["operationalDeployment"]}')


if __name__ == '__main__':
    main()
