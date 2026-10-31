# Path: data/generate_test_data.py
"""DIDEBAN deterministic synthetic fixture generator (phase 3.1.7.3).

Creates a NEW, explicitly named SQLite database. Never drops tables in an existing DB.
The synthetic labels are evaluation ground truth, NOT observed criminal conduct.
"""
from __future__ import annotations

import argparse
import json
import random
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

SCHEMA = {
    'ntsw_orders': '''CREATE TABLE ntsw_orders (order_reg_number TEXT PRIMARY KEY, importer_national_id TEXT NOT NULL, importer_name TEXT NOT NULL, hs_code TEXT NOT NULL, goods_description TEXT NOT NULL, total_usd REAL NOT NULL, created_at TEXT NOT NULL)''',
    'cbi_allocations': '''CREATE TABLE cbi_allocations (allocation_tracking_code TEXT PRIMARY KEY, order_reg_number TEXT NOT NULL, importer_national_id TEXT NOT NULL, currency_type TEXT NOT NULL, allocated_usd REAL NOT NULL, allocation_date TEXT NOT NULL)''',
    'epl_declarations': '''CREATE TABLE epl_declarations (cottage_number TEXT PRIMARY KEY, order_reg_number TEXT NOT NULL, importer_national_id TEXT NOT NULL, declared_hs_code TEXT NOT NULL, declared_goods_description TEXT NOT NULL, declared_value_usd REAL NOT NULL, customs_clearance_date TEXT NOT NULL, gross_weight_kg REAL NOT NULL, is_audited INTEGER DEFAULT 0)''',
    'bank_transactions': '''CREATE TABLE bank_transactions (transaction_rrn TEXT PRIMARY KEY, source_account TEXT NOT NULL, dest_account TEXT NOT NULL, customer_national_id TEXT NOT NULL, amount_irr REAL NOT NULL, transaction_date TEXT NOT NULL, is_audited INTEGER DEFAULT 0)''',
    'telecom_cdrs': '''CREATE TABLE telecom_cdrs (call_id TEXT PRIMARY KEY, caller_msisdn TEXT NOT NULL, receiver_msisdn TEXT NOT NULL, caller_national_id TEXT NOT NULL, imsi TEXT NOT NULL, imei TEXT NOT NULL, cell_id TEXT NOT NULL, duration_seconds INTEGER NOT NULL, call_date TEXT NOT NULL, is_audited INTEGER DEFAULT 0)''',
    'BomDefinitions': '''CREATE TABLE BomDefinitions (Id INTEGER PRIMARY KEY AUTOINCREMENT, FinishedGoodName TEXT NOT NULL, FinishedGoodHsCode TEXT NOT NULL, PartName TEXT NOT NULL, PartHsCode TEXT NOT NULL, PartDuty TEXT NOT NULL, IsEssential INTEGER DEFAULT 1)''',
    'DiscrepancyLogs': '''CREATE TABLE DiscrepancyLogs (Id INTEGER PRIMARY KEY AUTOINCREMENT, OrderRegNumber TEXT NOT NULL, CottageNumber TEXT NOT NULL, ImporterNationalId TEXT NOT NULL, RuleName TEXT NOT NULL, Description TEXT NOT NULL, RiskScore INTEGER NOT NULL, DetectedAt TEXT NOT NULL, DomainType TEXT DEFAULT 'CUSTOMS')''',
    'TacticalGateways': '''CREATE TABLE TacticalGateways (Id INTEGER PRIMARY KEY AUTOINCREMENT, Domain TEXT NOT NULL, Code TEXT NOT NULL UNIQUE, Name TEXT NOT NULL, Province TEXT NOT NULL, Longitude REAL NOT NULL, Latitude REAL NOT NULL, Category TEXT NOT NULL, RiskScore INTEGER NOT NULL)''',
    'SyntheticGroundTruth': '''CREATE TABLE SyntheticGroundTruth (Domain TEXT NOT NULL, RecordId TEXT NOT NULL, Scenario TEXT NOT NULL, Severity TEXT NOT NULL, FeaturesJson TEXT NOT NULL, PRIMARY KEY (Domain, RecordId))''',
}

BOM = [
    ('تلویزیون هوشمند', '85287200', 'مادربرد', '85423100', '5%', 1),
    ('تلویزیون هوشمند', '85287200', 'پنل نمایشگر', '85299065', '5%', 1),
    ('یخچال', '84182100', 'کمپرسور', '84143000', '5%', 1),
    ('کولر گازی', '84151010', 'کندانسور', '84189990', '5%', 1),
]
HS = [('84713000', 'لپ‌تاپ'), ('85171300', 'تلفن همراه'), ('84182100', 'یخچال'), ('96081000', 'لوازم اداری')]
SCENARIOS = ('normal', 'moderate', 'high', 'network')
SEVERITY = {'normal': 'control', 'moderate': 'medium', 'high': 'high', 'network': 'high'}
BASE = datetime(2026, 1, 1)


def build_database(db_path: Path, count: int = 10000, seed: int = 3173) -> dict:
    """Build a brand-new fixture; reject any existing file without touching it."""
    if count < 8:
        raise ValueError('--count must be at least 8')
    if db_path.exists():
        raise FileExistsError(f'Refusing to overwrite existing database: {db_path}')
    if db_path.suffix.lower() not in ('.db', '.sqlite', '.sqlite3'):
        raise ValueError('Output must have a SQLite file extension')
    db_path.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    counters = {domain: Counter() for domain in ('CUSTOMS', 'BANKING', 'TELECOM')}
    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            for ddl in SCHEMA.values():
                cur.execute(ddl)
            cur.executemany('INSERT INTO BomDefinitions (FinishedGoodName,FinishedGoodHsCode,PartName,PartHsCode,PartDuty,IsEssential) VALUES (?,?,?,?,?,?)', BOM)
            national_ids = [f'999{n:08d}' for n in range(1, 501)]
            # Shared accounts/phones create deliberately connected synthetic graphs.
            accounts = [f'SYN-ACC-{j:04d}' for j in range(max(16, count // 30))]
            phones = [f'SYN-MSISDN-{j:04d}' for j in range(max(16, count // 30))]
            for i in range(count):
                scenario = SCENARIOS[(i + seed) % len(SCENARIOS)]
                nid = national_ids[i % len(national_ids)]
                date = (BASE + timedelta(days=rng.randrange(80))).strftime('%Y-%m-%d')
                hs, desc = HS[rng.randrange(len(HS))]
                usd = round(rng.uniform(10000, 250000), 2)
                order = f'NTSW-2026-{i+1:06d}'
                cottage = f'EPL-COT-{i+1:06d}'
                # Synthetic scenario strength is driven by the declaration gap, not a random risk score.
                gap_ranges = {'normal': (0.0, 0.025), 'moderate': (0.08, 0.16), 'high': (0.32, 0.48), 'network': (0.18, 0.3)}
                lo, hi = gap_ranges[scenario]
                gap = rng.uniform(lo, hi)
                declared_hs = HS[(HS.index((hs, desc)) + 1) % len(HS)][0] if scenario == 'network' else hs
                cur.execute('INSERT INTO ntsw_orders VALUES (?,?,?,?,?,?,?)', (order, nid, f'شرکت آزمایشی {i % 500:04d}', hs, desc, usd, date))
                cur.execute('INSERT INTO cbi_allocations VALUES (?,?,?,?,?,?)', (f'CBI-TRK-{i+1:06d}', order, nid, 'NIMA', usd, date))
                cur.execute('INSERT INTO epl_declarations VALUES (?,?,?,?,?,?,?,?,?)', (cottage, order, nid, declared_hs, f'ترخیص {desc}', round(usd * (1-gap), 2), date, round(usd * .15, 2), 0))
                cur.execute('INSERT INTO SyntheticGroundTruth VALUES (?,?,?,?,?)', ('CUSTOMS', order, scenario, SEVERITY[scenario], json.dumps({'declarationGap': round(gap, 6), 'hsMismatch': declared_hs != hs}, sort_keys=True)))
                counters['CUSTOMS'][scenario] += 1
                # Banking: shared nodes in network scenario, mostly unique endpoints in normal scenario.
                src = accounts[(i // 4) % len(accounts)] if scenario == 'network' else f'SYN-ACC-SRC-{i:06d}'
                dst = accounts[((i // 4) + 1 + i % 3) % len(accounts)] if scenario == 'network' else f'SYN-ACC-DST-{i:06d}'
                if scenario == 'high':
                    src, dst = accounts[i % len(accounts)], accounts[(i+1) % len(accounts)]
                amount = {'normal': (50000, 500000), 'moderate': (500000, 5000000), 'high': (5000000, 50000000), 'network': (1000000, 10000000)}[scenario]
                rrn = f'RRN-{i+1:08d}'
                cur.execute('INSERT INTO bank_transactions VALUES (?,?,?,?,?,?,?)', (rrn, src, dst, nid, round(rng.uniform(*amount), 2), date+' 12:00:00', 0))
                cur.execute('INSERT INTO SyntheticGroundTruth VALUES (?,?,?,?,?)', ('BANKING', rrn, scenario, SEVERITY[scenario], json.dumps({'sharedNetwork': scenario in ('high','network')}, sort_keys=True)))
                counters['BANKING'][scenario] += 1
                # Telecom: repeated endpoint hubs for network/high, unique for normal.
                caller = phones[i % len(phones)] if scenario in ('high','network') else f'SYN-CALLER-{i:06d}'
                receiver = phones[(i+7) % len(phones)] if scenario == 'network' else f'SYN-RECEIVER-{i:06d}'
                duration = {'normal': (30, 240), 'moderate': (240, 1800), 'high': (1800, 7200), 'network': (5, 60)}[scenario]
                call_id = f'CALL-{i+1:08d}'
                cur.execute('INSERT INTO telecom_cdrs VALUES (?,?,?,?,?,?,?,?,?,?)', (call_id, caller, receiver, nid, f'SYN-IMSI-{i:08d}', f'SYN-IMEI-{i:08d}', f'BTS-SYN-{i%40:03d}', rng.randint(*duration), date+' 12:00:00', 0))
                cur.execute('INSERT INTO SyntheticGroundTruth VALUES (?,?,?,?,?)', ('TELECOM', call_id, scenario, SEVERITY[scenario], json.dumps({'hubPattern': scenario in ('high','network')}, sort_keys=True)))
                counters['TELECOM'][scenario] += 1
                domain = ('CUSTOMS','BANKING','TELECOM')[i % 3]
                category = {'CUSTOMS':'GATEWAY_BORDER','BANKING':'BRANCH_HUB','TELECOM':'BTS_CELL_SITE'}[domain]
                # This score is a transparent fixture-only display value, not a calibrated probability.
                base_score = {'normal': 20, 'moderate': 45, 'high': 75, 'network': 65}[scenario]
                cur.execute('INSERT INTO TacticalGateways (Domain,Code,Name,Province,Longitude,Latitude,Category,RiskScore) VALUES (?,?,?,?,?,?,?,?)', (domain, f'GW-CODE-{i+1:05d}', f'درگاه آزمایشی {i+1}', 'تهران', round(rng.uniform(44,62),4), round(rng.uniform(25,38),4), category, min(100, base_score + rng.randint(-8,8))))
            conn.commit()
    except BaseException:
        db_path.unlink(missing_ok=True)
        raise
    return {'synthetic': True, 'phase': '3.1.7.3', 'seed': seed, 'countPerDomain': count, 'database': str(db_path), 'scenarioCounts': {d: dict(c) for d,c in counters.items()}, 'note': 'Labels are synthetic ground truth, not criminal findings or calibrated probabilities.'}


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate a NEW, deterministic DIDEBAN synthetic SQLite fixture.')
    parser.add_argument('--db', type=Path, required=True, help='NEW SQLite path; existing paths are rejected')
    parser.add_argument('--count', type=int, default=10000, help='Records per primary domain')
    parser.add_argument('--seed', type=int, default=3173)
    parser.add_argument('--manifest', type=Path, help='Optional JSON manifest path (must not exist)')
    args = parser.parse_args()
    if args.manifest and args.manifest.exists():
        parser.error('Manifest already exists; refusing to overwrite')
    try:
        result = build_database(args.db, args.count, args.seed)
    except (ValueError, FileExistsError) as exc:
        parser.error(str(exc))
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
