import importlib.util
import sqlite3
import tempfile
from contextlib import closing
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('regression_runner', Path(__file__).with_name('run.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RegressionTests(unittest.TestCase):
    def test_missing_db_does_not_create_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'absent.db'
            with self.assertRaises(FileNotFoundError):
                module.load(db)
            self.assertFalse(db.exists())

    def test_load_real_fixture_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'fixture.db'
            with closing(sqlite3.connect(db)) as con, con:
                con.executescript('''
                CREATE TABLE SyntheticGroundTruth (Domain TEXT, RecordId TEXT, Scenario TEXT);
                CREATE TABLE ntsw_orders (order_reg_number TEXT, total_usd REAL, hs_code TEXT);
                CREATE TABLE epl_declarations (order_reg_number TEXT, declared_value_usd REAL, declared_hs_code TEXT);
                CREATE TABLE bank_transactions (transaction_rrn TEXT, amount_irr REAL, source_account TEXT, dest_account TEXT);
                CREATE TABLE telecom_cdrs (call_id TEXT, duration_seconds INTEGER, caller_msisdn TEXT, receiver_msisdn TEXT);
                INSERT INTO ntsw_orders VALUES ('O1',100, 'A');
                INSERT INTO epl_declarations VALUES ('O1',80,'B');
                INSERT INTO bank_transactions VALUES ('R1',1000,'A1','A2');
                INSERT INTO telecom_cdrs VALUES ('C1',30,'P1','P2');
                INSERT INTO SyntheticGroundTruth VALUES ('CUSTOMS','O1','high');
                INSERT INTO SyntheticGroundTruth VALUES ('BANKING','R1','normal');
                INSERT INTO SyntheticGroundTruth VALUES ('TELECOM','C1','network');
                ''')
            data = module.load(db)
            self.assertAlmostEqual(data['CUSTOMS'][0][0][0], 0.2)
            self.assertEqual(data['CUSTOMS'][0][0][1], 1)
            self.assertEqual(data['BANKING'][1].tolist(), [0])
            self.assertEqual(data['TELECOM'][1].tolist(), [1])

if __name__ == '__main__':
    unittest.main()
