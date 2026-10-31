"""Build an isolated synthetic graph fixture V2 from an existing benchmark copy."""
from __future__ import annotations
import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path

SCENARIOS = ('normal', 'moderate', 'high', 'network')
DOMAINS = {
    'BANKING': ('bank_transactions', 'transaction_rrn', 'source_account', 'dest_account'),
    'TELECOM': ('telecom_cdrs', 'call_id', 'caller_msisdn', 'receiver_msisdn'),
}
REQUIRED = {'ntsw_orders', 'epl_declarations', 'bank_transactions', 'telecom_cdrs', 'SyntheticGroundTruth'}

def generate(source: Path, output: Path, group_size: int = 40) -> dict:
    """Clone SQLite read-only, replace only synthetic endpoints; refuse overwrite."""
    source, output = source.resolve(), output.resolve()
    if group_size < 5:
        raise ValueError('group_size must be >= 5')
    if not source.is_file():
        raise FileNotFoundError(source)
    if source == output or output.exists():
        raise ValueError('Output must be a new database path')
    if source.name.lower() == 'dideban_dev.db' or output.name.lower() == 'dideban_dev.db':
        raise ValueError('Operational database filename is forbidden')
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src:
        tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED <= tables:
            raise ValueError('Not a synthetic benchmark: missing ' + str(sorted(REQUIRED - tables)))
        for domain, (table, key, _, _) in DOMAINS.items():
            missing = src.execute(f'''SELECT COUNT(*) FROM "{table}" t
                LEFT JOIN SyntheticGroundTruth g ON g.Domain=? AND g.RecordId=CAST(t."{key}" AS TEXT)
                WHERE g.Scenario IS NULL OR g.Scenario NOT IN ('normal','moderate','high','network')''', (domain,)).fetchone()[0]
            if missing:
                raise ValueError(f'{domain}: {missing} missing or invalid truth labels')
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            with closing(sqlite3.connect(output)) as dst:
                src.backup(dst)
                manifest = {'phase': '3.1.7.9.1', 'source': str(source), 'output': str(output),
                            'groupSize': group_size, 'sourceReadOnly': True, 'domains': {},
                            'warning': 'Synthetic component construction is not real-world generalization.'}
                with dst:
                    for domain, (table, key, left, right) in DOMAINS.items():
                        rows = dst.execute(f'''SELECT t."{key}",g.Scenario FROM "{table}" t
                            JOIN SyntheticGroundTruth g ON g.Domain=? AND g.RecordId=CAST(t."{key}" AS TEXT)
                            ORDER BY t."{key}"''', (domain,)).fetchall()
                        by_scenario = defaultdict(list)
                        for record_id, scenario in rows:
                            by_scenario[scenario].append(record_id)
                        updates = []
                        counts = Counter()
                        for scenario in SCENARIOS:
                            for i, record_id in enumerate(by_scenario[scenario]):
                                component = i // group_size
                                if i % group_size == 0:
                                    counts[scenario] += 1
                                prefix = f'FXV2_{domain}_{scenario}_{component:05d}'
                                updates.append((prefix + '_HUB', prefix + f'_LEAF_{i % group_size:04d}', record_id))
                        dst.executemany(f'UPDATE "{table}" SET "{left}"=?, "{right}"=? WHERE "{key}"=?', updates)
                        manifest['domains'][domain] = {
                            'rows': len(rows), 'componentsByScenario': dict(counts),
                            'positiveComponents': counts['high'] + counts['network'],
                            'negativeComponents': counts['normal'] + counts['moderate'],
                            'changedColumns': [left, right],
                        }
            return manifest
        except BaseException:
            if output.exists():
                output.unlink()
            raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--group-size', type=int, default=40)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.report and (args.report.exists() or args.report.resolve() in (args.db.resolve(), args.out.resolve())):
        parser.error('Report must be a new, separate path')
    result = generate(args.db, args.out, args.group_size)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open('x', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    for domain, item in result['domains'].items():
        print(domain, item)
    print('New synthetic fixture:', args.out)

if __name__ == '__main__':
    main()
