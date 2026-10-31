"""Read-only, leakage-aware synthetic regression benchmark for DIDEBAN."""
import argparse
import json
import sqlite3
from collections import Counter
from contextlib import closing
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DOMAINS = ('CUSTOMS', 'BANKING', 'TELECOM')


def load(db_path):
    """Return domain -> (features, labels, feature_names). No identifiers in X."""
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    result = {}
    with closing(sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        labels = {(domain, rid): scenario for domain, rid, scenario in db.execute(
            'SELECT Domain, RecordId, Scenario FROM SyntheticGroundTruth')}
        customs = db.execute('''SELECT o.order_reg_number, o.total_usd, d.declared_value_usd,
                o.hs_code, d.declared_hs_code FROM ntsw_orders o JOIN epl_declarations d
                ON o.order_reg_number=d.order_reg_number ORDER BY o.order_reg_number''').fetchall()
        banking = db.execute('SELECT transaction_rrn, amount_irr, source_account, dest_account FROM bank_transactions ORDER BY transaction_rrn').fetchall()
        telecom = db.execute('SELECT call_id, duration_seconds, caller_msisdn, receiver_msisdn FROM telecom_cdrs ORDER BY call_id').fetchall()
        src_count = Counter(r[2] for r in banking)
        dst_count = Counter(r[3] for r in banking)
        caller_count = Counter(r[2] for r in telecom)
        receiver_count = Counter(r[3] for r in telecom)
        sources = {
            'CUSTOMS': (customs, ['declaration_gap', 'hs_mismatch'], lambda r: [
                (float(r[1]) - float(r[2])) / max(abs(float(r[1])), 1.0),
                float(r[3] != r[4])]),
            'BANKING': (banking, ['log_amount', 'source_degree', 'destination_degree'], lambda r: [
                float(np.log1p(max(float(r[1]), 0))),
                float(src_count[r[2]]), float(dst_count[r[3]])]),
            'TELECOM': (telecom, ['log_duration', 'caller_degree', 'receiver_degree'], lambda r: [
                float(np.log1p(max(int(r[1]), 0))),
                float(caller_count[r[2]]), float(receiver_count[r[3]])]),
        }
        for domain, (rows, names, extractor) in sources.items():
            x, y = [], []
            for row in rows:
                scenario = labels.get((domain, row[0]))
                if scenario not in ('normal', 'moderate', 'high', 'network'):
                    raise ValueError(f'Missing/invalid label for {domain} {row[0]}')
                x.append(extractor(row))
                y.append(int(scenario in ('high', 'network')))
            result[domain] = (np.asarray(x, dtype=float), np.asarray(y, dtype=int), names)
    return result


def benchmark(db_path, seed=3176):
    results = {}
    for domain, (x, y, names) in load(db_path).items():
        if len(x) < 40 or len(np.unique(y)) != 2:
            raise ValueError(f'Insufficient labeled rows for {domain}')
        # All feature transforms and regression fitting happen within the training split.
        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=0.30, random_state=seed, stratify=y)
        model = make_pipeline(StandardScaler(), LogisticRegression(
            max_iter=2000, class_weight=None, random_state=seed))
        model.fit(x_train, y_train)
        probabilities = model.predict_proba(x_test)[:, 1]
        predicted = (probabilities >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_test, predicted, labels=[0, 1]).ravel()
        results[domain] = {
            'rows': len(x), 'trainRows': len(x_train), 'testRows': len(x_test),
            'features': names,
            'coefficientsStandardized': dict(zip(names, [round(float(v), 6) for v in model[-1].coef_[0]])),
            'intercept': round(float(model[-1].intercept_[0]), 6),
            'metrics': {
                'rocAuc': round(float(roc_auc_score(y_test, probabilities)), 6),
                'prAuc': round(float(average_precision_score(y_test, probabilities)), 6),
                'brier': round(float(brier_score_loss(y_test, probabilities)), 6),
                'precision': round(float(precision_score(y_test, predicted, zero_division=0)), 6),
                'recall': round(float(recall_score(y_test, predicted, zero_division=0)), 6),
                'f1': round(float(f1_score(y_test, predicted, zero_division=0)), 6),
                'confusionMatrix': {'TP': int(tp), 'FP': int(fp), 'FN': int(fn), 'TN': int(tn)}
            }
        }
    return {'phase': '3.1.7.6', 'status': 'EXPERIMENTAL_REGRESSION_EVALUATED',
            'readOnly': True, 'seed': seed, 'split': 'stratified_random_70_30',
            'positiveScenarios': ['high', 'network'],
            'warning': ('Synthetic scenarios are generated using directly separable feature ranges. '
                        'High metrics do not establish real-world validity. '
                        'Account/phone frequency is calculated across the full synthetic fixture '
                        '(unlabeled graph context), which is transductive. '
                        'No identity fields, FeaturesJson, or record indices enter the model. '
                        'Random splitting does not establish temporal or entity-group generalization.'),
            'domains': results}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--seed', type=int, default=3176)
    args = parser.parse_args()
    if args.out.resolve() == args.db.resolve() or args.out.exists():
        parser.error('Output must be a new JSON path, different from the input database')
    result = benchmark(args.db, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    for domain, values in result['domains'].items():
        print(domain, values['metrics'])
    print('Report:', args.out)


if __name__ == '__main__':
    main()
