"""Stage an isolated SQLite benchmark database; never start the backend."""
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path

REQUIRED = {'ntsw_orders','epl_declarations','bank_transactions','telecom_cdrs','SyntheticGroundTruth','DiscrepancyLogs'}

def prepare(source: Path, output_dir: Path) -> dict:
    source = source.resolve(strict=True)
    output_dir = output_dir.resolve()
    if not source.is_file() or source.suffix.lower() != '.db':
        raise ValueError('Source must be an existing .db file')
    if output_dir == source.parent or source in output_dir.parents:
        raise ValueError('Output directory must be separate from the source directory')
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError('Output directory must be new or empty')
    with closing(sqlite3.connect(f'file:{source.as_posix()}?mode=ro', uri=True)) as connection:
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = REQUIRED - tables
        if missing:
            raise ValueError('Missing tables: ' + ', '.join(sorted(missing)))
        counts = {name: connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in sorted(REQUIRED)}
        if counts['SyntheticGroundTruth'] == 0:
            raise ValueError('Ground truth is empty')
        output_dir.mkdir(parents=True, exist_ok=True)
        target = output_dir / 'operational_benchmark.db'
        with closing(sqlite3.connect(target)) as destination:
            connection.backup(destination)
    report = {'phase':'3.1.7.5','source':str(source),'operationalCopy':str(target),'identityDatabase':str(output_dir/'identity_benchmark.db'),'securityAuditDatabase':str(output_dir/'security_audit_benchmark.db'),'countsBefore':counts,'backendExecuted':False,'status':'STAGED_NOT_EVALUATED'}
    (output_dir/'preflight.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',required=True,type=Path)
    parser.add_argument('--out-dir',required=True,type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.db,args.out_dir),indent=2,ensure_ascii=False))
