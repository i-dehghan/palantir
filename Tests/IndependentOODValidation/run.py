"""DIDEBAN 3.1.7.13: frozen duration-only model on independently generated synthetic OOD.

No operational integration. OOD labels are scenario assignments, NOT verified misconduct.
"""
from __future__ import annotations
import argparse
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss, confusion_matrix, precision_score, recall_score, f1_score

ROOT = Path(__file__).resolve().parents[1]

def import_file(name, path):
    if not path.is_file():
        raise FileNotFoundError(f'Required existing runner: {path}')
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def generate_ood(n=10000, seed=31713, shift='overlap'):
    """Independent random generator. Scenario prevalence 50% positive by design.

    Duration distributions intentionally overlap; the generator does not use
    the fitted model, calibration set, policy set, or evaluation scores.
    """
    if n < 100 or n % 4:
        raise ValueError('n must be >=100 and divisible by 4')
    if shift not in ('overlap', 'inversion'):
        raise ValueError('unsupported OOD scenario')
    rng = np.random.default_rng(seed)
    labels = np.repeat(np.array([0, 0, 1, 1], dtype=int), n // 4)
    rng.shuffle(labels)
    # Log-duration distributions have substantial class overlap. Inversion
    # represents a severe synthetic mechanism shift, not a realistic forecast.
    if shift == 'overlap':
        means = np.where(labels == 1, 6.0, 5.2)
        sd = 1.65
    else:
        means = np.where(labels == 1, 4.8, 6.1)
        sd = 1.5
    log_duration = np.clip(rng.normal(means, sd), np.log1p(1), np.log1p(10000))
    duration = np.expm1(log_duration)
    return np.log1p(duration).reshape(-1, 1), labels


def metrics(y, p, threshold):
    predicted = (p >= threshold).astype(int)
    tn, fp, fn, tp = [int(v) for v in confusion_matrix(y, predicted, labels=[0, 1]).ravel()]
    return {
        'rocAuc': round(float(roc_auc_score(y, p)), 6),
        'prAuc': round(float(average_precision_score(y, p)), 6),
        'brier': round(float(brier_score_loss(y, p)), 6),
        'precision': round(float(precision_score(y, predicted, zero_division=0)), 6),
        'recall': round(float(recall_score(y, predicted, zero_division=0)), 6),
        'f1': round(float(f1_score(y, predicted, zero_division=0)), 6),
        'confusionMatrix': {'TN': tn, 'FP': fp, 'FN': fn, 'TP': tp},
    }


def run(db_path, n=10000, seed=31713):
    db_path = Path(db_path)
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    if db_path.name.lower() == 'dideban_dev.db':
        raise ValueError('Operational database forbidden')
    temporal = import_file('dideban_temporal_31713', ROOT / 'TemporalFeatureBenchmark' / 'run.py')
    core = temporal.core
    rows = temporal.load(db_path)
    splits, _ = temporal.chronological_splits(rows)
    y = np.array([int(r[5] in ('high', 'network')) for r in rows], dtype=int)
    train, cal = splits['train'], splits['calibratorFit']
    if len(set(y[train])) != 2 or len(set(y[cal])) != 2:
        raise ValueError('Both classes required in training and calibration')
    x = np.log1p(np.maximum(np.array([float(r[1]) for r in rows]), 0)).reshape(-1, 1)
    model = core.new_model(31711)
    model.fit(x[train], y[train])
    calibrated = core.calibrate_prefitted(model, x[cal], y[cal], 'isotonic')
    # FROZEN, from the 3.1.7.12 policy report, not optimized on OOD.
    threshold = 0.86177518
    cases = {}
    for shift in ('overlap', 'inversion'):
        x_ood, y_ood = generate_ood(n, seed + (0 if shift == 'overlap' else 100003), shift)
        p = calibrated.predict_proba(x_ood)[:, 1]
        cases[shift] = {
            'rows': len(y_ood), 'positives': int(y_ood.sum()),
            'durationLogMeanByLabel': {
                'negative': round(float(x_ood[y_ood == 0].mean()), 6),
                'positive': round(float(x_ood[y_ood == 1].mean()), 6),
            },
            'selectedThreshold': metrics(y_ood, p, threshold),
            'defaultThreshold': metrics(y_ood, p, .5),
            'predictedPositiveRate': round(float(np.mean(p >= threshold)), 6),
        }
    return {
        'phase': '3.1.7.13', 'status': 'INDEPENDENT_GENERATOR_SYNTHETIC_OOD_ONLY',
        'readOnly': True, 'trainingDatabaseSha256': sha256(db_path),
        'trainingRows': len(train), 'calibrationRows': len(cal),
        'frozenSpecification': {
            'feature': 'log1p(duration_seconds)', 'model': 'StandardScaler + LogisticRegression',
            'modelSeed': 31711, 'calibration': 'isotonic',
            'threshold': threshold, 'thresholdSource': '3.1.7.12 policy selection',
            'noOodTuning': True,
        },
        'oodGenerator': {'seed': seed, 'rowsPerScenario': n, 'syntheticOnly': True,
                         'description': 'Two predeclared distribution shifts with overlapping or reversed class log-durations'},
        'cases': cases,
        'limitations': [
            'Synthetic labels and synthetic generator, not observed misconduct or real-world OOD.',
            'The OOD generator is independent of training data but designed by the evaluator; not an external dataset.',
            'No OOD results used for feature, calibration or threshold selection.',
            'Training uses a chronological split with shared graph endpoints; duration-only model has no graph inputs.',
            'Fixed threshold is rounded from the prior report; model artifact was not persisted, so retraining is deterministic.',
            'No operational data, database, or service modified.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--n', type=int, default=10000)
    parser.add_argument('--seed', type=int, default=31713)
    args = parser.parse_args()
    if args.out.suffix.lower() != '.json' or args.out.exists() or args.out.resolve() == args.db.resolve():
        parser.error('Output must be a new, non-existing JSON file')
    result = run(args.db, args.n, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    for name, case in result['cases'].items():
        m = case['selectedThreshold']
        print(f'{name}: ROC-AUC={m["rocAuc"]} F1={m["f1"]} Precision={m["precision"]} Recall={m["recall"]}')
    print('Report:', args.out)


if __name__ == '__main__':
    main()
