#!/usr/bin/env python3
"""3.1.7.18: new synthetic fixture with pre-label stable signal; no production access."""
import argparse
import hashlib
import json
import math
import random
import sqlite3
from collections import Counter
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path

ENVIRONMENTS = ('A', 'B', 'C', 'D')
SEED = 31718
SCHEMA = '''CREATE TABLE SyntheticTelecomV4 (
 event_id TEXT PRIMARY KEY, environment TEXT NOT NULL,
 event_time TEXT NOT NULL, caller TEXT NOT NULL, receiver TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds>=0),
 context_score REAL NOT NULL CHECK(context_score>=0 AND context_score<=1),
 synthetic_label INTEGER NOT NULL CHECK(synthetic_label IN (0,1)));
CREATE INDEX idx_v4_env_time ON SyntheticTelecomV4(environment,event_time);
CREATE TABLE FixtureMetadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);'''


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def make_rows(seed=SEED, rows_per_env=2500, nodes=180, label_seed=None):
    if rows_per_env < 100 or nodes < 12:
        raise ValueError('rows_per_env >= 100 and nodes >= 12 required')
    rows = []
    for idx, env in enumerate(ENVIRONMENTS):
        # Endpoints, timestamps and stable context generated before labels.
        topology_rng = random.Random(seed + 2000 + idx)
        context_rng = random.Random(seed + 3000 + idx)
        outcome_rng = random.Random((seed + 4000 + idx) if label_seed is None else label_seed + idx)
        duration_rng = random.Random(seed + 5000 + idx)
        communities = [topology_rng.randrange(10) for _ in range(nodes)]
        edges = []
        for caller in range(nodes):
            options = [n for n in range(nodes) if n != caller and communities[n] == communities[caller]]
            if not options:
                options = [n for n in range(nodes) if n != caller]
            edges.extend((caller, topology_rng.choice(options)) for _ in range(4))
        start = datetime(2026, 1, 1) + timedelta(days=idx * 40)
        for k in range(rows_per_env):
            caller, receiver = topology_rng.choice(edges)
            timestamp = start + timedelta(hours=6 * (k // 5))
            # Context is an observed synthetic covariate, not a label encoding.
            context = context_rng.random()
            # Stable mechanism across environments: P(Y=1 | context).
            probability = sigmoid(-2.1 + 3.5 * context)
            label = int(outcome_rng.random() < probability)
            # Nuisance duration association shifts by environment.
            separation = (1.0, 0.65, 0.25, -0.2)[idx]
            log_duration = 5.0 + separation * label + duration_rng.gauss(0, 1.0)
            duration = max(0, min(86400, round(math.expm1(max(0, log_duration)))))
            rows.append((f'{env}-{k:07d}', env, timestamp.isoformat(),
                         f'{env}-N{caller:04d}', f'{env}-N{receiver:04d}',
                         duration, round(context, 9), label))
    return rows


def summarize(rows, include_sealed=False):
    summary = {}
    for env in ENVIRONMENTS:
        data = [r for r in rows if r[1] == env]
        pairs = Counter((r[3], r[4]) for r in data)
        item = {'rows': len(data), 'uniquePairs': len(pairs),
                'repeatedPairs': sum(count > 1 for count in pairs.values())}
        if env != 'D' or include_sealed:
            item['positiveRate'] = round(sum(r[7] for r in data) / len(data), 6)
            item['contextMean'] = round(sum(r[6] for r in data) / len(data), 6)
        summary[env] = item
    return summary


def generate(out_dir, seed=SEED, rows_per_env=2500, nodes=180):
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    db = out / 'synthetic_fixture_v4_31718.db'
    manifest = out / 'fixture_v4_manifest_31718.json'
    if db.exists() or manifest.exists():
        raise FileExistsError('Output exists: refusing overwrite')
    rows = make_rows(seed, rows_per_env, nodes)
    try:
        with closing(sqlite3.connect(db)) as conn:
            with conn:
                conn.executescript(SCHEMA)
                conn.executemany('INSERT INTO SyntheticTelecomV4 VALUES (?,?,?,?,?,?,?,?)', rows)
                conn.executemany('INSERT INTO FixtureMetadata VALUES (?,?)', [
                    ('phase', '3.1.7.18'), ('syntheticOnly', 'true'),
                    ('stableSignal', 'P(label=1|context)=sigmoid(-2.1+3.5*context)'),
                    ('environmentD', 'sealed_by_protocol')])
        result = {'phase': '3.1.7.18', 'status': 'SYNTHETIC_FIXTURE_ONLY',
                  'seed': seed, 'syntheticOnly': True, 'dbSha256': sha256(db),
                  'schemaTable': 'SyntheticTelecomV4',
                  'environmentRoles': {'A': 'train', 'B': 'calibration',
                                       'C': 'policy_selection', 'D': 'sealed_final_evaluation'},
                  'preRegisteredMechanism': {
                      'stableSignal': 'context_score',
                      'labelProbability': 'sigmoid(-2.1 + 3.5 * context_score)',
                      'durationSeparationByEnvironment': {'A': 1.0, 'B': 0.65, 'C': 0.25, 'D': -0.2},
                      'topologyGeneratedBeforeLabels': True,
                      'separateRandomStreams': True},
                  'audit': summarize(rows),
                  'limitations': [
                      'Labels are synthetic, not observed wrongdoing.',
                      'The stable signal is deliberately injected; performance on this fixture cannot validate real-world predictive value.',
                      'Environment D is sealed only by protocol; its mechanism is predeclared but its row-level outcomes must not be used for development.',
                      'No model training or operational changes in this phase.']}
        manifest.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        return result
    except BaseException:
        # Only remove artifacts created by this invocation.
        db.unlink(missing_ok=True)
        manifest.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--seed', type=int, default=SEED)
    parser.add_argument('--rows-per-env', type=int, default=2500)
    parser.add_argument('--nodes', type=int, default=180)
    args = parser.parse_args()
    result = generate(args.out_dir, args.seed, args.rows_per_env, args.nodes)
    print(json.dumps({'phase': result['phase'], 'dbSha256': result['dbSha256'],
                      'rowsABC': sum(result['audit'][e]['rows'] for e in 'ABC'),
                      'sealedD': 'NOT_EVALUATED'}))


if __name__ == '__main__':
    main()
