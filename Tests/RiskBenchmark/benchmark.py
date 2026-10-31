"""DIDEBAN 3.1.7.4: read-only synthetic fixture benchmark.

Diagnostic proxy metrics are NOT backend RiskScore, probabilities, or crime findings.
"""
from __future__ import annotations
import argparse
import json
import math
import sqlite3
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path

DOMAINS = ('CUSTOMS', 'BANKING', 'TELECOM')
SCENARIOS = ('normal', 'moderate', 'high', 'network')


def evaluate(db: Path) -> dict:
    if not db.is_file():
        raise FileNotFoundError(db)
    uri = db.resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {'SyntheticGroundTruth', 'ntsw_orders', 'epl_declarations', 'bank_transactions', 'telecom_cdrs'}
        if not required <= tables:
            raise ValueError(f'Missing required tables: {sorted(required - tables)}')
        truth = defaultdict(dict)
        for row in conn.execute('SELECT Domain, RecordId, Scenario, FeaturesJson FROM SyntheticGroundTruth'):
            if row['Domain'] in DOMAINS:
                if row['Scenario'] not in SCENARIOS:
                    raise ValueError(f'Unknown scenario {row["Scenario"]}')
                truth[row['Domain']][row['RecordId']] = (row['Scenario'], json.loads(row['FeaturesJson']))
        results = {}
        # Customs proxy: fractional declared-value gap plus HS mismatch.
        customs = {}
        for r in conn.execute('SELECT o.order_reg_number id, o.total_usd original, e.declared_value_usd declared, o.hs_code hs, e.declared_hs_code declared_hs FROM ntsw_orders o JOIN epl_declarations e ON e.order_reg_number=o.order_reg_number'):
            gap = max(0., (r['original'] - r['declared']) / r['original']) if r['original'] > 0 else 0.
            customs[r['id']] = round(100 * min(1., gap + (0.2 if r['hs'] != r['declared_hs'] else 0)), 6)
        # Banking proxy: amount plus endpoint reuse. Fixed formula; not a trained model.
        banks = list(conn.execute('SELECT transaction_rrn id, source_account src, dest_account dst, amount_irr amount FROM bank_transactions'))
        bdegree = Counter()
        for r in banks:
            bdegree[r['src']] += 1
            bdegree[r['dst']] += 1
        banking = {r['id']: round(100 * min(1., 0.6 * math.log1p(max(0., r['amount'])) / math.log1p(50000000) + 0.4 * min(1., (bdegree[r['src']] + bdegree[r['dst']] - 2) / 20)), 6) for r in banks}
        # Telecom proxy: duration plus endpoint reuse. Short network calls can be flagged by reuse.
        calls = list(conn.execute('SELECT call_id id, caller_msisdn src, receiver_msisdn dst, duration_seconds duration FROM telecom_cdrs'))
        tdegree = Counter()
        for r in calls:
            tdegree[r['src']] += 1
            tdegree[r['dst']] += 1
        telecom = {r['id']: round(100 * min(1., 0.5 * min(1., max(0., r['duration']) / 7200) + 0.5 * min(1., (tdegree[r['src']] + tdegree[r['dst']] - 2) / 20)), 6) for r in calls}
        for domain, values in zip(DOMAINS, (customs, banking, telecom)):
            by_scenario = defaultdict(list)
            for rid, (scenario, _) in truth[domain].items():
                if rid in values:
                    by_scenario[scenario].append(values[rid])
            missing = len(truth[domain]) - sum(map(len, by_scenario.values()))
            summaries = {}
            for scenario in SCENARIOS:
                nums = by_scenario[scenario]
                summaries[scenario] = {'count': len(nums), 'meanProxyScore': round(sum(nums) / len(nums), 4) if nums else None, 'minProxyScore': min(nums) if nums else None, 'maxProxyScore': max(nums) if nums else None}
            normal = summaries['normal']['meanProxyScore']
            high = summaries['high']['meanProxyScore']
            results[domain] = {'groundTruthRows': len(truth[domain]), 'matchedRows': sum(map(len, by_scenario.values())), 'unmatchedRows': missing, 'scenarios': summaries, 'highMeanExceedsNormal': high > normal if high is not None and normal is not None else None}
        # DiscrepancyLogs is populated by reconciliation, not by generator. No fabricated engine metrics.
        log_count = conn.execute('SELECT COUNT(*) FROM DiscrepancyLogs').fetchone()[0] if 'DiscrepancyLogs' in tables else None
        return {'phase': '3.1.7.4', 'synthetic': True, 'database': str(db), 'readOnly': True, 'metricsType': 'DIAGNOSTIC_PROXY_NOT_BACKEND_RISK', 'domains': results, 'reconciliation': {'discrepancyLogRows': log_count, 'backendBenchmarkStatus': 'NOT_EVALUATED', 'reason': 'No verified mapping of backend output to ground-truth record IDs; run backend in an isolated environment and export keyed results first.'}, 'graphPropagation': {'status': 'NOT_EVALUATED', 'reason': 'Requires backend graph-risk response per scenario; database features alone cannot verify propagation.'}, 'warning': 'Ground-truth labels are synthetic scenario definitions, not criminal findings or calibrated probabilities.'}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    a = p.parse_args()
    if a.out.resolve() == a.db.resolve():
        p.error('Report path must differ from database path')
    report = evaluate(a.db)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    for domain, data in report['domains'].items():
        print(f'{domain}: matched={data["matchedRows"]}, missing={data["unmatchedRows"]}, high>normal={data["highMeanExceedsNormal"]}')
    print('Backend reconciliation and propagation: NOT_EVALUATED')
    print('Report:', a.out)

if __name__ == '__main__':
    main()
