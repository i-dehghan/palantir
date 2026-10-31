import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import generate

def fixture(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript('''
        CREATE TABLE ntsw_orders(order_reg_number TEXT);
        CREATE TABLE epl_declarations(cottage_number TEXT);
        CREATE TABLE bank_transactions(transaction_rrn TEXT PRIMARY KEY,source_account TEXT,dest_account TEXT);
        CREATE TABLE telecom_cdrs(call_id TEXT PRIMARY KEY,caller_msisdn TEXT,receiver_msisdn TEXT);
        CREATE TABLE SyntheticGroundTruth(Domain TEXT,RecordId TEXT,Scenario TEXT);
        ''')
        for domain, table in [('BANKING','bank_transactions'),('TELECOM','telecom_cdrs')]:
            for scenario in ('normal','moderate','high','network'):
                for i in range(25):
                    rid=f'{domain}-{scenario}-{i:03d}'
                    db.execute(f'INSERT INTO {table} VALUES(?,?,?)',(rid,'old_left','old_right'))
                    db.execute('INSERT INTO SyntheticGroundTruth VALUES(?,?,?)',(domain,rid,scenario))
        db.commit()

class FixtureTests(unittest.TestCase):
    def test_clone_and_original_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/'source.db'; dst=Path(td)/'v2.db'; fixture(src)
            report=generate(src,dst,10)
            self.assertEqual(report['domains']['BANKING']['positiveComponents'],6)
            with closing(sqlite3.connect(src)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM bank_transactions WHERE source_account='old_left'").fetchone()[0],100)
            with closing(sqlite3.connect(dst)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM bank_transactions WHERE source_account='old_left'").fetchone()[0],0)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM SyntheticGroundTruth').fetchone()[0],200)
    def test_refuse_overwrite_and_operational_name(self):
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/'source.db'; fixture(src)
            with self.assertRaises(ValueError):generate(src,src)
            with self.assertRaises(ValueError):generate(src,Path(td)/'dideban_dev.db')
            self.assertFalse((Path(td)/'dideban_dev.db').exists())
if __name__=='__main__':unittest.main()
