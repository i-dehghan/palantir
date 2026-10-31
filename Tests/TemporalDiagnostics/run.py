"""Phase 3.1.7.12: read-only synthetic temporal diagnostics.

All feature-selection diagnostics use train/calibratorFit/policySelection ONLY.
Test is not used for selection or reported as a candidate-selection score.
"""
from __future__ import annotations
import argparse
from collections import Counter
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import numpy as np
from sklearn.metrics import brier_score_loss, roc_auc_score, average_precision_score

HERE = Path(__file__).resolve().parent
PREVIOUS = HERE.parent / 'TemporalFeatureBenchmark' / 'run.py'
if not PREVIOUS.is_file():
    raise FileNotFoundError(f'Install phase 3.1.7.11 first: {PREVIOUS}')
spec = importlib.util.spec_from_file_location('dideban_temporal_diagnostics_previous', PREVIOUS)
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)


def distribution(x, columns, indices):
    result = {}
    for j, name in enumerate(columns):
        values = np.asarray(x[indices, j], dtype=float)
        if not np.isfinite(values).all():
            raise ValueError(f'Non-finite feature: {name}')
        result[name] = {
            'mean': round(float(values.mean()), 6),
            'std': round(float(values.std()), 6),
            'median': round(float(np.median(values)), 6),
            'p05': round(float(np.quantile(values, .05)), 6),
            'p95': round(float(np.quantile(values, .95)), 6),
            'zeroRate': round(float(np.mean(values == 0)), 6),
            'uniqueValues': int(np.unique(values).size),
        }
    return result


def standardized_mean_shift(x, columns, train, other):
    a, b = x[train], x[other]
    return {name: round(float(abs(a[:, j].mean() - b[:, j].mean()) /
            max(float(a[:, j].std()), 1e-8)), 6) for j, name in enumerate(columns)}


def candidate(x, y, splits, columns, chosen, seed, minimum_precision):
    tr, cal, sel = (splits[k] for k in ('train', 'calibratorFit', 'policySelection'))
    model = previous.core.new_model(seed)
    model.fit(x[tr][:, chosen], y[tr])
    options = {'uncalibrated': model}
    for method in ('sigmoid', 'isotonic'):
        options[method] = previous.core.calibrate_prefitted(model, x[cal][:, chosen], y[cal], method)
    briers = {name: float(brier_score_loss(y[sel], est.predict_proba(x[sel][:, chosen])[:, 1]))
              for name, est in options.items()}
    method = min(briers, key=lambda name: (briers[name], ('uncalibrated', 'sigmoid', 'isotonic').index(name)))
    prob = options[method].predict_proba(x[sel][:, chosen])[:, 1]
    threshold, feasible = previous.core.choose_threshold(y[sel], prob, minimum_precision)
    # A returned threshold=1 when infeasible is a sentinel, not an operational decision.
    summary = previous.core.scores(y[sel], prob, threshold) if feasible else None
    pipe = model
    coef = pipe.named_steps['logisticregression'].coef_[0] if 'logisticregression' in pipe.named_steps else None
    if coef is None:
        coef = next(step.coef_[0] for step in pipe.named_steps.values() if hasattr(step, 'coef_'))
    return {
        'features': [columns[j] for j in chosen],
        'standardizedCoefficients': {columns[j]: round(float(v), 6) for j, v in zip(chosen, coef)},
        'policySelectionBrierByMethod': {k: round(v, 6) for k, v in briers.items()},
        'selectedCalibration': method,
        'policySelectionRocAuc': round(float(roc_auc_score(y[sel], prob)), 6),
        'policySelectionPrAuc': round(float(average_precision_score(y[sel], prob)), 6),
        'policyPrecisionConstraintFeasible': bool(feasible),
        'selectedThreshold': round(float(threshold), 8) if feasible else None,
        'policySelectionAtSelectedThreshold': summary,
    }


def run(db_path, seed=31712, minimum_precision=.8):
    if not 0 < minimum_precision <= 1:
        raise ValueError('minimum precision must be in (0,1]')
    rows = previous.load(db_path)
    splits, times = previous.chronological_splits(rows)
    y = np.asarray([int(r[5] in ('high', 'network')) for r in rows], dtype=int)
    for name, idx in splits.items():
        if set(y[idx]) != {0, 1}:
            raise ValueError(f'{name}: missing a label class')
    x, names = previous.causal_features(rows)
    train = splits['train']
    # Test features may be described for distribution drift only, NEVER used in candidate selection.
    distributions = {k: distribution(x, names, idx) for k, idx in splits.items()}
    shifts = {k: standardized_mean_shift(x, names, train, idx)
              for k, idx in splits.items() if k != 'train'}
    idx = {name: i for i, name in enumerate(names)}
    groups = {
        'duration_only': ['log_duration'],
        'history_only': [n for n in names if n != 'log_duration'],
        'duration_plus_frequency': ['log_duration', 'caller_calls_1d', 'caller_calls_7d', 'caller_calls_30d'],
        'duration_plus_pairs': ['log_duration', 'pair_calls_1d', 'pair_calls_7d', 'pair_calls_30d'],
        'duration_plus_diversity': ['log_duration', 'distinct_peers_1d', 'distinct_peers_7d', 'distinct_peers_30d'],
        'duration_plus_mean': ['log_duration', 'log_mean_prior_duration_30d'],
        'all_features': names,
    }
    experiments = {k: candidate(x, y, splits, names, [idx[n] for n in selected], seed, minimum_precision)
                   for k, selected in groups.items()}
    valid = [(k, v) for k, v in experiments.items() if v['policyPrecisionConstraintFeasible']]
    # Rank by POLICY-ONLY Brier; do not use test metrics for feature selection.
    recommendation = min(valid, key=lambda kv: (
        kv[1]['policySelectionBrierByMethod'][kv[1]['selectedCalibration']], kv[0]))[0] if valid else None
    return {
        'phase': '3.1.7.12', 'status': 'SYNTHETIC_TEMPORAL_DIAGNOSTICS_NO_TEST_SELECTION',
        'readOnly': True, 'rows': len(rows), 'seed': seed,
        'splitSizes': {k: len(v) for k, v in splits.items()},
        'splitPositiveRates': {k: round(float(y[v].mean()), 6) for k, v in splits.items()},
        'featureNames': names, 'featureDistributions': distributions,
        'standardizedMeanShiftVsTrain': shifts,
        'policyOnlyAblations': experiments,
        'candidateForFutureIndependentEvaluation': recommendation,
        'selectionRule': 'Policy-selection Brier among feasible-precision candidates; no test metric used.',
        'testEvaluationPerformed': False,
        'limitations': [
            'Synthetic fixture with scenario-derived graph topology; not real-world evidence.',
            'Chronological splits share graph endpoints; not graph-component-disjoint.',
            'Historical features use prior timestamp events across chronological partitions.',
            'Policy selection reused across candidate comparisons; further independent OOD validation required.',
            'Test feature distributions are descriptive only; test labels and metrics never used for model selection.',
            'No operational data or model changes.',
        ],
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--seed', type=int, default=31712)
    p.add_argument('--min-precision', type=float, default=.8)
    a = p.parse_args()
    if a.out.suffix.lower() != '.json' or a.out.exists() or a.out.resolve() == a.db.resolve():
        p.error('Output must be a new, non-existing JSON file')
    result = run(a.db, a.seed, a.min_precision)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open('x', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print('Candidate (policy only):', result['candidateForFutureIndependentEvaluation'])
    print('Test evaluation performed:', result['testEvaluationPerformed'])
    print('Report:', a.out)

if __name__ == '__main__':
    main()
