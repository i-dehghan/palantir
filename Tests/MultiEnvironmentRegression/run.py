#!/usr/bin/env python3
"""Offline synthetic-only A/B/C regression; never queries sealed D rows."""
import argparse
import hashlib
import json
import math
import sqlite3
from collections import Counter, deque
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             confusion_matrix, precision_recall_fscore_support,
                             roc_auc_score)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 31716
CANDIDATES = {
    'duration_only': ('log_duration',),
    'duration_plus_frequency': ('log_duration', 'caller_7d', 'caller_30d'),
    'duration_plus_pair_history': ('log_duration', 'caller_7d', 'caller_30d', 'pair_7d', 'pair_30d'),
}
FEATURES = ('log_duration', 'caller_7d', 'caller_30d', 'pair_7d', 'pair_30d')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read_development(db):
    """SQL is explicitly restricted to A/B/C; D is not fetched."""
    with closing(sqlite3.connect(f'file:{Path(db).resolve().as_posix()}?mode=ro', uri=True)) as conn:
        return conn.execute('''SELECT event_id,environment,event_time,caller,receiver,
                           duration_seconds,synthetic_label FROM SyntheticTelecomV3
                           WHERE environment IN ('A','B','C')
                           ORDER BY environment,event_time,event_id''').fetchall()


def extract(rows):
    """Past-only features; all same-timestamp events see the same prior state."""
    result = {}
    for env in ('A', 'B', 'C'):
        records = [r for r in rows if r[1] == env]
        records.sort(key=lambda r: (r[2], r[0]))
        history = deque()  # (time, caller, receiver)
        caller_7, caller_30, pair_7, pair_30 = Counter(), Counter(), Counter(), Counter()
        pending = []
        i = 0
        features, labels = [], []
        while i < len(records):
            timestamp = records[i][2]
            t = datetime.fromisoformat(timestamp)
            # Keep last 30d; use separate 7d counts computed from history.
            while history and history[0][0] < t - timedelta(days=30):
                _, c, r = history.popleft()
                caller_30[c] -= 1
                pair_30[(c, r)] -= 1
            caller_7.clear(); pair_7.clear()
            for old_t, c, r in history:
                if old_t >= t - timedelta(days=7):
                    caller_7[c] += 1
                    pair_7[(c, r)] += 1
            j = i
            while j < len(records) and records[j][2] == timestamp:
                event_id, _, _, caller, receiver, duration, label = records[j]
                vals = (math.log1p(duration),
                        math.log1p(caller_7[caller]), math.log1p(caller_30[caller]),
                        math.log1p(pair_7[(caller, receiver)]),
                        math.log1p(pair_30[(caller, receiver)]))
                features.append(vals)
                labels.append(int(label))
                pending.append((t, caller, receiver))
                j += 1
            for event in pending:
                history.append(event)
                caller_30[event[1]] += 1
                pair_30[(event[1], event[2])] += 1
            pending.clear()
            i = j
        result[env] = (np.asarray(features, dtype=float), np.asarray(labels, dtype=int))
    return result


def metrics(y, probabilities, threshold):
    pred = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel().tolist()
    p, r, f1, _ = precision_recall_fscore_support(y, pred, average='binary', zero_division=0)
    return {'rocAuc': round(float(roc_auc_score(y, probabilities)), 6),
            'prAuc': round(float(average_precision_score(y, probabilities)), 6),
            'brier': round(float(brier_score_loss(y, probabilities)), 6),
            'precision': round(float(p), 6), 'recall': round(float(r), 6),
            'f1': round(float(f1), 6),
            'confusion': {'TN': tn, 'FP': fp, 'FN': fn, 'TP': tp}}


def select_threshold(y, prob, minimum_precision=0.8):
    # All distinct thresholds are considered; require >= 1 predicted positive.
    choices = []
    for threshold in np.unique(prob):
        pred = prob >= threshold
        count = int(pred.sum())
        if count == 0:
            continue
        tp = int(np.sum(pred & (y == 1)))
        precision = tp / count
        recall = tp / int(np.sum(y == 1))
        if precision >= minimum_precision:
            choices.append((recall, precision, -float(threshold), float(threshold)))
    if not choices:
        return None
    return max(choices)[3]


def evaluate(db, manifest, minimum_precision=0.8):
    if not 0 < minimum_precision <= 1:
        raise ValueError('minimum_precision must be in (0,1]')
    metadata = json.loads(Path(manifest).read_text(encoding='utf-8'))
    digest = sha256(db)
    if metadata.get('dbSha256') != digest:
        raise ValueError('Database SHA256 does not match fixture manifest')
    if metadata.get('phase') != '3.1.7.15':
        raise ValueError('Unexpected fixture phase')
    split = extract(read_development(db))
    if any(len(split[e][1]) < 50 or len(set(split[e][1])) != 2 for e in ('A','B','C')):
        raise ValueError('Development environments must contain both classes and >=50 rows')
    output = {'phase': '3.1.7.16', 'status': 'SYNTHETIC_DEVELOPMENT_ONLY',
              'dbSha256': digest, 'minimumPrecision': minimum_precision,
              'sealedEnvironmentD': 'NOT_QUERIED', 'seed': SEED,
              'splitRows': {e: len(split[e][1]) for e in ('A','B','C')},
              'candidateResults': {}}
    for name, cols in CANDIDATES.items():
        idx = [FEATURES.index(c) for c in cols]
        x_a, y_a = split['A']; x_b, y_b = split['B']; x_c, y_c = split['C']
        base = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, random_state=SEED))
        base.fit(x_a[:, idx], y_a)
        # Prefit model, calibrate on independent B only. sklearn 1.6+ FrozenEstimator.
        from sklearn.frozen import FrozenEstimator
        calibrated = CalibratedClassifierCV(FrozenEstimator(base), method='sigmoid')
        calibrated.fit(x_b[:, idx], y_b)
        probs = calibrated.predict_proba(x_c[:, idx])[:, 1]
        threshold = select_threshold(y_c, probs, minimum_precision)
        output['candidateResults'][name] = {
            'features': list(cols), 'calibration': 'sigmoid_on_B',
            'feasible': threshold is not None,
            'threshold': None if threshold is None else round(threshold, 10),
            'policyMetrics': metrics(y_c, probs, threshold) if threshold is not None else None,
            'rankingMetrics': {'rocAuc': round(float(roc_auc_score(y_c, probs)), 6),
                               'prAuc': round(float(average_precision_score(y_c, probs)), 6),
                               'brier': round(float(brier_score_loss(y_c, probs)), 6)}
        }
    feasible = [(name, item) for name, item in output['candidateResults'].items() if item['feasible']]
    if feasible:
        # C-only model selection: highest recall at precision constraint; deterministic ties.
        name, item = max(feasible, key=lambda x: (x[1]['policyMetrics']['recall'],
                                                 x[1]['policyMetrics']['precision'], -list(CANDIDATES).index(x[0])))
        output['selected'] = {'candidate': name, 'threshold': item['threshold'],
                              'policyMetrics': item['policyMetrics']}
        output['decision'] = 'DEVELOPMENT_ONLY_NOT_DEPLOYABLE'
    else:
        output['selected'] = None
        output['decision'] = 'NO_FEASIBLE_POLICY'
    output['limitations'] = ['Labels and duration distributions are synthetic',
                             'C is used for selection and is not an unbiased final test',
                             'D is not queried; deployment remains NO-GO',
                             'Topology is independent of labels by construction']
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--minimum-precision', type=float, default=0.8)
    args = parser.parse_args()
    target = Path(args.out)
    if target.exists():
        parser.error('Refusing to overwrite existing report')
    report = evaluate(args.db, args.manifest, args.minimum_precision)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'decision': report['decision'], 'selected': report['selected'],
                      'out': str(target)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
