"""Read-only risk distribution audit for DIDEBAN development SQLite database."""
import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='data/dideban_dev.db')
    parser.add_argument('--out', default='risk-distribution-report.json')
    args = parser.parse_args()
    db = Path(args.db)
    if not db.is_file():
        parser.error(f'Database not found: {db}')
    # URI mode=ro guarantees no database writes.
    connection = sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'DiscrepancyLogs' not in tables:
            parser.error('DiscrepancyLogs table is missing')
        cols = {r[1] for r in connection.execute('PRAGMA table_info("DiscrepancyLogs")')}
        required = {'RiskScore', 'DomainType', 'RuleName'}
        if not required.issubset(cols):
            parser.error(f'Missing columns: {sorted(required - cols)}')
        rows = connection.execute('SELECT "RiskScore", "DomainType", "RuleName" FROM "DiscrepancyLogs"').fetchall()
        histogram = Counter(str(score) for score, _, _ in rows)
        domains = {}
        for score, domain, rule in rows:
            key = str(domain or 'UNKNOWN')
            entry = domains.setdefault(key, {'count': 0, 'scores': Counter(), 'rules': Counter()})
            entry['count'] += 1
            entry['scores'][str(score)] += 1
            entry['rules'][str(rule or 'UNKNOWN')] += 1
        result = {
            'source': 'DiscrepancyLogs (read-only)',
            'total': len(rows),
            'score_histogram': dict(sorted(histogram.items(), key=lambda p: float(p[0]) if p[0] not in ('None','') else -1)),
            'share_score_97_percent': round(100 * histogram.get('97', 0) / len(rows), 2) if rows else 0,
            'domains': {key: {'count': val['count'], 'scores': dict(val['scores']), 'rules': dict(val['rules'])} for key, val in sorted(domains.items())},
            'note': 'Descriptive audit only. Scores are not calibrated probabilities.'
        }
        output = Path(args.out)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"Rows: {len(rows)}; score=97: {histogram.get('97', 0)} ({result['share_score_97_percent']}%)")
        for name, info in result['domains'].items():
            print(f"  {name}: {info['count']} rows; score frequencies: {info['scores']}")
        print(f'Report: {output.resolve()}')
    finally:
        connection.close()

if __name__ == '__main__':
    main()
