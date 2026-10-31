#!/usr/bin/env python3
"""3.1.7.15: independent, synthetic-only fixture; never touches operational DB."""
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

SEED = 31715
ENVIRONMENTS = ('A', 'B', 'C', 'D')
SCHEMA = '''CREATE TABLE SyntheticTelecomV3 (
 event_id TEXT PRIMARY KEY, environment TEXT NOT NULL,
 event_time TEXT NOT NULL, caller TEXT NOT NULL, receiver TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds>=0),
 synthetic_label INTEGER NOT NULL CHECK(synthetic_label IN (0,1)),
 synthetic_scenario TEXT NOT NULL);
CREATE INDEX idx_v3_time ON SyntheticTelecomV3(environment,event_time);
CREATE TABLE FixtureMetadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);'''


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def make_rows(seed=SEED, rows_per_env=2500, nodes=180, label_seed=None):
    if rows_per_env < 100 or nodes < 12:
        raise ValueError('rows-per-env >=100 and nodes >=12 required')
    rng = random.Random(seed if label_seed is None else label_seed)
    result = []
    topology = {}
    for env_idx, env in enumerate(ENVIRONMENTS):
        # Graph topology is generated BEFORE any scenario/label draw.
        # Independent graph RNG is deliberately separated from label RNG.
        graph_rng = random.Random(seed + 1000 + env_idx)
        group = [graph_rng.randrange(8) for _ in range(nodes)]
        edges = []
        for i in range(nodes):
            candidates = [j for j in range(nodes) if j != i and group[j] == group[i]]
            if not candidates:
                candidates = [j for j in range(nodes) if j != i]
            for _ in range(3):
                edges.append((i, graph_rng.choice(candidates)))
        # Generate event endpoints and timestamps independently of labels.
        # Reuse edges intentionally to create repeated pairs.
        starts = datetime(2026, 1, 1) + timedelta(days=env_idx * 45)
        env_events = []
        for k in range(rows_per_env):
            u, v = graph_rng.choice(edges)
            # Every 6 hours: repeated-pair activity occurs inside 1d/7d/30d.
            ts = starts + timedelta(hours=6 * (k // 5))
            env_events.append((ts, u, v))
        topology[env] = {'nodeCount': nodes, 'edgePoolSize': len(edges),
                         'uniqueEdgePoolSize': len(set(edges))}
        for k, (ts, u, v) in enumerate(env_events):
            # Scenario draw is independent of the generated graph and endpoints.
            label = int(rng.random() < 0.35)
            # Environment-specific duration relationship (deliberate shifts).
            separation = (1.05, 0.65, 0.35, -0.25)[env_idx]
            log_duration = 5.1 + separation * label + rng.gauss(0, 1.05)
            duration = max(0, min(86400, round(math.expm1(max(0, log_duration)))))
            result.append((f'{env}-{k:07d}', env, ts.isoformat(),
                           f'{env}-N{u:04d}', f'{env}-N{v:04d}',
                           duration, label, 'synthetic_positive' if label else 'synthetic_negative'))
    return result, topology


def audit(rows):
    by_env = {}
    for env in ENVIRONMENTS:
        data = [r for r in rows if r[1] == env]
        pairs = Counter((r[3], r[4]) for r in data)
        times = [r[2] for r in data]
        by_env[env] = {
            'rows': len(data), 'positives': sum(r[6] for r in data),
            'positiveRate': round(sum(r[6] for r in data) / len(data), 6),
            'firstTimestamp': min(times), 'lastTimestamp': max(times),
            'uniquePairs': len(pairs),
            'repeatedPairs': sum(n > 1 for n in pairs.values()),
            'repeatedPairEvents': sum(n for n in pairs.values() if n > 1),
            'uniqueEndpoints': len({n for r in data for n in (r[3], r[4])}),
        }
    return by_env


def generate(out_dir, seed=SEED, rows_per_env=2500, nodes=180):
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    db = out / 'synthetic_fixture_v3_31715.db'
    manifest_path = out / 'fixture_v3_manifest_31715.json'
    if db.exists() or manifest_path.exists():
        raise FileExistsError('Refusing overwrite: use a NEW output directory; D must remain immutable')
    rows, topology = make_rows(seed, rows_per_env, nodes)
    report = audit(rows)
    if any(x['repeatedPairs'] == 0 for x in report.values()):
        raise RuntimeError('Fixture lacks repeated pairs')
    # SQLite writes to a fresh path only; never attaches or updates source DB.
    try:
        with closing(sqlite3.connect(db)) as conn, conn:
            conn.executescript(SCHEMA)
            conn.executemany('INSERT INTO SyntheticTelecomV3 VALUES (?,?,?,?,?,?,?,?)', rows)
            conn.executemany('INSERT INTO FixtureMetadata VALUES (?,?)', [
                ('phase', '3.1.7.15'), ('seed', str(seed)),
                ('syntheticOnly', 'true'), ('labelTopologyPolicy', 'independent_rng_pre_label'),
                ('environmentDPolicy', 'sealed_no_training_or_selection'),
            ])
        manifest = {
            'phase': '3.1.7.15', 'status': 'SYNTHETIC_FIXTURE_ONLY',
            'seed': seed, 'syntheticOnly': True, 'dbSha256': sha256(db),
            'schemaTable': 'SyntheticTelecomV3',
            'environmentRoles': {'A': 'train', 'B': 'calibration',
                                 'C': 'policy_selection', 'D': 'sealed_final_evaluation'},
            'graphGeneration': 'separate seeded RNG; graph and endpoints generated before labels',
            'labels': 'independent Bernoulli draws, duration depends on label and environment',
            'limitations': [
                'Synthetic labels are not observed misconduct.',
                'Topology is independent of labels by construction, not a proof of real-world representativeness.',
                'Environment D is sealed by protocol, not cryptographically access-controlled.',
                'No model training or final-environment evaluation in this phase.',
                'Endpoint prefixes prevent cross-environment identity overlap by design.',
            ],
            'topology': topology, 'audit': report,
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except Exception:
        db.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)
        raise
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--seed', type=int, default=SEED)
    parser.add_argument('--rows-per-env', type=int, default=2500)
    parser.add_argument('--nodes', type=int, default=180)
    args = parser.parse_args()
    result = generate(args.out_dir, args.seed, args.rows_per_env, args.nodes)
    print(json.dumps({'phase': result['phase'], 'dbSha256': result['dbSha256'],
                      'audit': result['audit']}, indent=2))


if __name__ == '__main__':
    main()
