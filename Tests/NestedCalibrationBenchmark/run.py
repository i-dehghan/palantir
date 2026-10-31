"""DIDEBAN 3.1.7.10 — four-way graph-disjoint synthetic evaluation.

Requires the existing Tests/LeakageFreeValidation/run.py (phase 3.1.7.9).
Does not train or modify operational services. Input SQLite is read-only.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import numpy as np
from sklearn.metrics import brier_score_loss
from sklearn.model_selection import GroupShuffleSplit

BASE = Path(__file__).resolve().parents[1] / 'LeakageFreeValidation' / 'run.py'
if not BASE.is_file():
    raise FileNotFoundError(f'Install phase 3.1.7.9 first: {BASE}')
spec = importlib.util.spec_from_file_location('dideban_leakage_free_3179', BASE)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)

FEATURE_NAMES = {'CUSTOMS': ['declaration_gap', 'hs_mismatch'],
                 'BANKING': ['log_amount', 'source_degree', 'destination_degree'],
                 'TELECOM': ['log_duration', 'caller_degree', 'receiver_degree']}


def four_way(domain, rows, y, seed):
    """60% model fit / 10% calibrator fit / 10% policy selection / 20% test.

    Component and entity grouping is never relaxed; reject infeasible data.
    """
    train, calibration, test, groups = core.split_indices(domain, rows, seed, y)
    best = None
    for trial in range(100):
        splitter = GroupShuffleSplit(n_splits=1, test_size=.5, random_state=seed + 1000 + trial)
        left, right = next(splitter.split(np.zeros(len(calibration)), groups=groups[calibration]))
        fit, select = calibration[left], calibration[right]
        if any(len(ix) < 20 or len(np.unique(y[ix])) != 2 for ix in (fit, select)):
            continue
        imbalance = abs(len(fit) - len(select)) + abs(float(y[fit].mean()-y[select].mean())) * len(calibration)
        if best is None or imbalance < best[0]:
            best = (imbalance, fit, select)
    if best is None:
        raise ValueError(f'{domain}: cannot create label-feasible component-disjoint calibrator and policy splits')
    fit, select = best[1:]
    splits = {'train': train, 'calibratorFit': fit, 'policySelection': select, 'test': test}
    for a, ia in splits.items():
        for b, ib in splits.items():
            if a < b and set(groups[ia]) & set(groups[ib]):
                raise AssertionError(f'Group overlap between {a} and {b}')
    return splits, groups


def evaluate_feature_set(domain, rows, y, splits, columns, seed, min_precision):
    x = {name: core.features(domain, rows, ix, ix)[:, columns] for name, ix in splits.items()}
    tr, fit, select, test = (splits[k] for k in ('train', 'calibratorFit', 'policySelection', 'test'))
    model = core.new_model(seed)
    model.fit(x['train'], y[tr])
    candidates = {'uncalibrated': model}
    for method in ('sigmoid', 'isotonic'):
        candidates[method] = core.calibrate_prefitted(model, x['calibratorFit'], y[fit], method)
    # Selection data never trains the model or calibrators.
    selection_predictions = {k: est.predict_proba(x['policySelection'])[:, 1]
                             for k, est in candidates.items()}
    selection_brier = {k: float(brier_score_loss(y[select], p))
                       for k, p in selection_predictions.items()}
    selected = min(selection_brier, key=lambda k: (selection_brier[k],
                   {'uncalibrated': 0, 'sigmoid': 1, 'isotonic': 2}[k]))
    threshold, feasible = core.choose_threshold(y[select], selection_predictions[selected], min_precision)
    test_prob = candidates[selected].predict_proba(x['test'])[:, 1]
    return {'features': [FEATURE_NAMES[domain][i] for i in columns],
            'selectedCalibration': selected,
            'policySelectionBrierByMethod': {k: round(v, 6) for k, v in selection_brier.items()},
            'selectedThreshold': round(float(threshold), 8),
            'policyPrecisionConstraintFeasible': bool(feasible),
            'testAtSelectedThreshold': core.scores(y[test], test_prob, threshold),
            'testAtDefaultThreshold': core.scores(y[test], test_prob, .5),
            'testAtConservativeThreshold': core.scores(y[test], test_prob, .8)}


def run(db_path, seed=31710, min_precision=.8):
    if not 0 < min_precision <= 1:
        raise ValueError('min_precision must be in (0,1]')
    output = {'phase': '3.1.7.10', 'status': 'EXPERIMENTAL_SYNTHETIC_FOUR_WAY_HOLDOUT',
              'readOnly': True, 'seed': seed, 'minimumPolicyPrecision': min_precision,
              'domains': {}, 'limitations': [
                  'All labels are synthetic, not observed misconduct.',
                  'GraphFixtureV2 topology was generated using synthetic scenarios.',
                  'Test features use within-test graph degrees, not production online history.',
                  'Ablation test results are diagnostics only; do not select features using them.',
                  'No operational model, service, or database was changed.']}
    for domain, (rows, y) in core.load(db_path).items():
        splits, groups = four_way(domain, rows, y, seed)
        all_cols = list(range(len(FEATURE_NAMES[domain])))
        baseline = evaluate_feature_set(domain, rows, y, splits, all_cols, seed, min_precision)
        endpoint_overlap = None
        if domain != 'CUSTOMS':
            sets = [{str(rows[i][j]) for i in ix for j in (2, 3)} for ix in splits.values()]
            endpoint_overlap = sum(len(sets[i] & sets[j]) for i in range(4) for j in range(i+1, 4))
            if endpoint_overlap:
                raise AssertionError(f'{domain}: graph endpoint leakage: {endpoint_overlap}')
        item = {'rows': len(rows), 'componentOrEntityGroups': len(set(groups)),
                'groupOverlap': 0, 'graphEndpointOverlap': endpoint_overlap,
                'splits': {k: {'rows': len(ix), 'positives': int(y[ix].sum()),
                               'positiveRate': round(float(y[ix].mean()), 6)}
                           for k, ix in splits.items()},
                'fullModel': baseline}
        if domain == 'TELECOM':
            ablations = {}
            for i, name in enumerate(FEATURE_NAMES[domain]):
                keep = [j for j in all_cols if j != i]
                ablations['without_' + name] = evaluate_feature_set(
                    domain, rows, y, splits, keep, seed, min_precision)
            for i, name in enumerate(FEATURE_NAMES[domain]):
                ablations['only_' + name] = evaluate_feature_set(
                    domain, rows, y, splits, [i], seed, min_precision)
            item['featureAblation'] = ablations
        output['domains'][domain] = item
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--seed', type=int, default=31710)
    parser.add_argument('--min-precision', type=float, default=.8)
    args = parser.parse_args()
    if args.out.suffix.lower() != '.json' or args.out.exists() or args.out.resolve() == args.db.resolve():
        parser.error('Output must be a new, non-existing .json file, different from input')
    result = run(args.db, args.seed, args.min_precision)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    for domain, item in result['domains'].items():
        model = item['fullModel']
        print(domain, 'method=', model['selectedCalibration'],
              'F1=', model['testAtSelectedThreshold']['f1'],
              'graphOverlap=', item['graphEndpointOverlap'])
    print('Report:', args.out)


if __name__ == '__main__':
    main()
