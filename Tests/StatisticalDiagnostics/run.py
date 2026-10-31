#!/usr/bin/env python3
"""Read-only synthetic A/B/C diagnostics; no training, no D access."""
import argparse
import json
import importlib.util
from pathlib import Path
import sys

import numpy as np
from sklearn.metrics import roc_auc_score

_prior = Path(__file__).resolve().parents[1] / 'MultiEnvironmentRegression' / 'run.py'
_spec = importlib.util.spec_from_file_location('regression_31716_runner', _prior)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
FEATURES, extract, read_development, sha256 = (_module.FEATURES, _module.extract, _module.read_development, _module.sha256)


def summarize(values):
    v = np.asarray(values, dtype=float)
    return {'count': int(v.size), 'mean': round(float(v.mean()), 6),
            'std': round(float(v.std()), 6), 'p10': round(float(np.quantile(v, .1)), 6),
            'p50': round(float(np.median(v)), 6), 'p90': round(float(np.quantile(v, .9)), 6),
            'zeroFraction': round(float(np.mean(v == 0)), 6)}


def audit(db, manifest, regression):
    metadata = json.loads(Path(manifest).read_text(encoding='utf-8'))
    previous = json.loads(Path(regression).read_text(encoding='utf-8'))
    digest = sha256(db)
    if metadata.get('dbSha256') != digest or previous.get('dbSha256') != digest:
        raise ValueError('SHA256 provenance mismatch')
    if metadata.get('phase') != '3.1.7.15' or previous.get('phase') != '3.1.7.16':
        raise ValueError('Unexpected source phase')
    if previous.get('sealedEnvironmentD') != 'NOT_QUERIED':
        raise ValueError('Source report does not confirm D exclusion')
    split = extract(read_development(db))
    output = {'phase': '3.1.7.17', 'status': 'SYNTHETIC_READ_ONLY_DIAGNOSTICS',
              'dbSha256': digest, 'sealedEnvironmentD': 'NOT_QUERIED',
              'modelTraining': False, 'thresholdSelection': False, 'environments': {},
              'candidateComparison': {}, 'decision': 'NO_GO'}
    for env in 'ABC':
        x, y = split[env]
        feature_summary = {}
        for i, feature in enumerate(FEATURES):
            pos = x[y == 1, i]
            neg = x[y == 0, i]
            auc = float(roc_auc_score(y, x[:, i]))
            feature_summary[feature] = {
                'all': summarize(x[:, i]), 'positive': summarize(pos), 'negative': summarize(neg),
                'univariateAuc': round(auc, 6),
                'orientationInvariantAuc': round(max(auc, 1 - auc), 6)}
        output['environments'][env] = {
            'rows': len(y), 'positiveRate': round(float(y.mean()), 6),
            'features': feature_summary,
            'pairHistoryNonzeroFraction': round(float(np.mean(x[:, FEATURES.index('pair_30d')] > 0)), 6)}
    c = previous['candidateResults']
    for name, item in c.items():
        output['candidateComparison'][name] = {
            'features': item['features'], 'rankingMetricsC': item['rankingMetrics'],
            'policyMetricsC': item['policyMetrics'], 'feasibleOnC': item['feasible'],
            'predictedPositiveCountC': None if item['policyMetrics'] is None else (
                item['policyMetrics']['confusion']['TP'] + item['policyMetrics']['confusion']['FP'])}
    output['limitations'] = [
        'A/B/C feature-label association is descriptive, not causal',
        'Calibration reliability curves cannot be reconstructed from aggregate regression report; row-level saved probabilities are unavailable',
        'C was used to choose candidate and threshold, so C policy metrics are selection-biased',
        'Synthetic labels are not observed misconduct',
        'No access to environment D, no retraining, no operational changes']
    return output


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--db', required=True)
    p.add_argument('--manifest', required=True)
    p.add_argument('--regression', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    out = Path(args.out)
    if out.exists():
        p.error('Refusing to overwrite an existing report')
    result = audit(args.db, args.manifest, args.regression)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'phase': result['phase'], 'decision': result['decision'], 'out': str(out)}))


if __name__ == '__main__':
    main()
