#!/usr/bin/env python3
"""Phase 3.1.7.19: synthetic A/B/C-only stable vs spurious regression."""
import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 31719
FEATURES = ('log_duration', 'context_score')
CANDIDATES = {'duration_only': (0,), 'context_only': (1,), 'combined': (0, 1)}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_development(db):
    """Do not SELECT D; even feature extraction is scoped to A/B/C."""
    uri = f'file:{Path(db).resolve().as_posix()}?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        return conn.execute('''SELECT environment,duration_seconds,context_score,synthetic_label
            FROM SyntheticTelecomV4 WHERE environment IN ('A','B','C')
            ORDER BY environment,event_time,event_id''').fetchall()


def prepare(rows):
    out = {}
    for env in 'ABC':
        part = [r for r in rows if r[0] == env]
        x = np.array([[np.log1p(r[1]), r[2]] for r in part], dtype=float)
        y = np.array([r[3] for r in part], dtype=int)
        if len(y) < 50 or set(y.tolist()) != {0, 1} or not np.isfinite(x).all():
            raise ValueError(f'Invalid development environment {env}')
        out[env] = (x, y)
    return out


def select_threshold(y, probabilities, minimum_precision):
    """Maximize recall subject to precision constraint on C; no D evaluation."""
    order = np.argsort(-probabilities, kind='stable')
    scores, labels = probabilities[order], y[order]
    tp = np.cumsum(labels)
    n = np.arange(1, len(labels) + 1)
    valid = np.r_[scores[:-1] != scores[1:], True]
    feasible = np.where(valid & (tp / n >= minimum_precision))[0]
    if len(feasible) == 0:
        return None
    idx = feasible[np.argmax(tp[feasible])]
    return float(scores[idx])


def summarize(y, probs, threshold):
    summary = {'rocAuc': round(float(roc_auc_score(y, probs)), 6),
               'prAuc': round(float(average_precision_score(y, probs)), 6),
               'brier': round(float(brier_score_loss(y, probs)), 6)}
    if threshold is not None:
        pred = probs >= threshold
        tn, fp, fn, tp = map(int, confusion_matrix(y, pred, labels=[0, 1]).ravel())
        summary['policy'] = {'threshold': round(threshold, 10),
                             'precision': round(tp / (tp + fp), 6),
                             'recall': round(tp / (tp + fn), 6),
                             'f1': round(2 * tp / (2 * tp + fp + fn), 6),
                             'confusion': {'TN': tn, 'FP': fp, 'FN': fn, 'TP': tp}}
    else:
        summary['policy'] = None
    return summary


def evaluate(db, manifest, minimum_precision=0.8):
    if not 0 < minimum_precision <= 1:
        raise ValueError('minimum precision must be in (0,1]')
    metadata = json.loads(Path(manifest).read_text(encoding='utf-8'))
    digest = sha256(db)
    if metadata.get('phase') != '3.1.7.18' or metadata.get('dbSha256') != digest:
        raise ValueError('Fixture phase or SHA256 mismatch')
    split = prepare(read_development(db))
    result = {'phase': '3.1.7.19', 'status': 'SYNTHETIC_DEVELOPMENT_ONLY',
              'fixtureSha256': digest, 'minimumPrecision': minimum_precision,
              'seed': SEED, 'environmentD': 'NOT_QUERIED',
              'rows': {e: len(split[e][1]) for e in 'ABC'}, 'candidates': {}}
    for name, columns in CANDIDATES.items():
        xa, ya = split['A']; xb, yb = split['B']; xc, yc = split['C']
        model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, random_state=SEED))
        model.fit(xa[:, columns], ya)
        calibrated = CalibratedClassifierCV(FrozenEstimator(model), method='sigmoid')
        calibrated.fit(xb[:, columns], yb)
        pb = calibrated.predict_proba(xb[:, columns])[:, 1]
        pc = calibrated.predict_proba(xc[:, columns])[:, 1]
        threshold = select_threshold(yc, pc, minimum_precision)
        result['candidates'][name] = {
            'features': [FEATURES[i] for i in columns],
            'calibration': 'sigmoid_B', 'calibrationB': summarize(yb, pb, None),
            'policyC': summarize(yc, pc, threshold), 'feasible': threshold is not None}
    feasible = [(name, value) for name, value in result['candidates'].items() if value['feasible']]
    if feasible:
        name, data = max(feasible, key=lambda pair: (
            pair[1]['policyC']['policy']['recall'],
            pair[1]['policyC']['policy']['precision'],
            -list(CANDIDATES).index(pair[0])))
        result['selected'] = {'candidate': name, **data['policyC']['policy']}
    else:
        result['selected'] = None
    result['decision'] = 'DEVELOPMENT_ONLY_NOT_DEPLOYABLE' if feasible else 'NO_FEASIBLE_POLICY'
    result['limitations'] = [
        'Context score is intentionally label-informative in the synthetic generator.',
        'C is used for threshold/model selection: its policy metrics are optimistically selected.',
        'D is not queried; final evaluation requires separate explicit authorization.',
        'No production inference or individual risk assessment is supported.']
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--minimum-precision', type=float, default=0.8)
    args = parser.parse_args()
    output = Path(args.out)
    if output.exists():
        parser.error('Refusing to overwrite existing report')
    report = evaluate(args.db, args.manifest, args.minimum_precision)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    print(json.dumps({'decision': report['decision'], 'selected': report['selected'],
                      'out': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
