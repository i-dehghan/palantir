"""Read-only synthetic robustness diagnostics; not a production validation."""
from __future__ import annotations
import argparse
import json
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DOMAINS = ('CUSTOMS', 'BANKING', 'TELECOM')

def groups_from_db(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        return {
            'CUSTOMS': [r[0] for r in db.execute('SELECT importer_national_id FROM ntsw_orders ORDER BY order_reg_number')],
            'BANKING': [r[0] for r in db.execute('SELECT customer_national_id FROM bank_transactions ORDER BY transaction_rrn')],
            'TELECOM': [r[0] for r in db.execute('SELECT caller_national_id FROM telecom_cdrs ORDER BY call_id')],
        }

def score(y, prob):
    pred = prob >= .5
    return {'rocAuc': round(float(roc_auc_score(y, prob)), 6) if len(np.unique(y)) == 2 else None,
            'prAuc': round(float(average_precision_score(y, prob)), 6) if len(np.unique(y)) == 2 else None,
            'brier': round(float(brier_score_loss(y, prob)), 6),
            'precision': round(float(precision_score(y, pred, zero_division=0)), 6),
            'recall': round(float(recall_score(y, pred, zero_division=0)), 6),
            'f1': round(float(f1_score(y, pred, zero_division=0)), 6)}

def evaluate(db_path, seed=3177):
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    # Reuse the exact feature extraction logic from the established baseline.
    regression_dir = Path(__file__).resolve().parents[1] / 'RegressionBenchmark'
    if not (regression_dir / 'run.py').exists():
        raise FileNotFoundError('Tests/RegressionBenchmark/run.py is required')
    sys.path.insert(0, str(regression_dir))
    from run import load
    data = load(db_path)
    groups = groups_from_db(db_path)
    results = {}
    for domain in DOMAINS:
        x, y, names = data[domain]
        g = np.asarray(groups[domain])
        if len(x) != len(g) or len(set(g)) < 5:
            raise ValueError(f'Invalid group alignment for {domain}')
        train, test = next(GroupShuffleSplit(n_splits=1, test_size=.3, random_state=seed).split(x, y, g))
        if len(np.unique(y[train])) != 2 or len(np.unique(y[test])) != 2:
            raise ValueError(f'Both classes required in each split: {domain}')
        assert set(g[train]).isdisjoint(set(g[test]))
        model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, random_state=seed))
        model.fit(x[train], y[train])
        rng = np.random.default_rng(seed)
        clean = model.predict_proba(x[test])[:, 1]
        # Perturb measured values, not identifiers or ground truth. This is a stress test,
        # not a true independent out-of-distribution labeled dataset.
        perturbed = x[test].copy()
        if domain == 'CUSTOMS':
            perturbed[:, 0] = np.clip(perturbed[:, 0] + rng.normal(0, .04, len(test)), 0, 1)
            flips = rng.random(len(test)) < .02
            perturbed[flips, 1] = 1 - perturbed[flips, 1]
        else:
            perturbed[:, 0] += rng.normal(0, .25, len(test))
            perturbed[:, 1:] = np.maximum(0, perturbed[:, 1:] * rng.lognormal(0, .25, (len(test), 2)))
        noisy = model.predict_proba(perturbed)[:, 1]
        # Decision boundary stress is descriptive, not an accuracy metric.
        near = np.abs(clean - .5) <= .1
        results[domain] = {
            'featureNames': names, 'trainRows': int(len(train)), 'testRows': int(len(test)),
            'trainGroups': int(len(set(g[train]))), 'testGroups': int(len(set(g[test]))),
            'groupOverlap': 0, 'cleanGroupHoldout': score(y[test], clean),
            'measurementNoiseStress': score(y[test], noisy),
            'predictionFlipRateUnderNoise': round(float(np.mean((clean >= .5) != (noisy >= .5))), 6),
            'nearThresholdCount': int(near.sum()),
            'nearThresholdErrorCount': int(np.sum((clean[near] >= .5) != y[test][near])),
            'note': 'Group holdout uses synthetic national IDs; graph endpoint isolation is not guaranteed.'
        }
    return {'phase': '3.1.7.7', 'status': 'SYNTHETIC_ROBUSTNESS_DIAGNOSTICS',
            'readOnly': True, 'seed': seed, 'results': results,
            'limitations': [
                'This is NOT independent out-of-distribution validation: perturbations reuse original labels.',
                'Synthetic labels and features are rule-generated; high scores do not establish real-world accuracy.',
                'Graph-node overlap across groups may remain; evaluate connected components separately.',
                'No operational model or database is changed.']}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--db', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--seed', type=int, default=3177)
    a = p.parse_args()
    if a.out.resolve() == a.db.resolve() or a.out.exists() or a.out.suffix.lower() != '.json':
        p.error('Output must be a new JSON path, different from the input database')
    result = evaluate(a.db, a.seed)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    for domain, item in result['results'].items():
        print(domain, 'clean=', item['cleanGroupHoldout'], 'noise=', item['measurementNoiseStress'])
    print('Report:', a.out)

if __name__ == '__main__':
    main()
