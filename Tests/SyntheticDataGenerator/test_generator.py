# Path: Tests/SyntheticDataGenerator/test_generator.py
import hashlib
from contextlib import closing
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2] / 'data' / 'generate_test_data.py'
spec = importlib.util.spec_from_file_location('dideban_fixture_generator', MODULE)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def db_fingerprint(path):
    with closing(sqlite3.connect(path)) as conn:
        payload = []
        for table in ('ntsw_orders', 'epl_declarations', 'bank_transactions', 'telecom_cdrs', 'TacticalGateways', 'SyntheticGroundTruth'):
            payload.extend(repr(row) for row in conn.execute(f'SELECT * FROM {table} ORDER BY 1'))
    return hashlib.sha256('\n'.join(payload).encode()).hexdigest()


class SyntheticDataGeneratorTests(unittest.TestCase):
    def test_deterministic_and_schema_compatible(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'a.db', Path(folder)/'b.db'
            generator.build_database(a, count=40, seed=42)
            generator.build_database(b, count=40, seed=42)
            self.assertEqual(db_fingerprint(a), db_fingerprint(b))
            with closing(sqlite3.connect(a)) as conn:
                for table in ('ntsw_orders', 'cbi_allocations', 'epl_declarations', 'bank_transactions', 'telecom_cdrs', 'TacticalGateways'):
                    self.assertEqual(conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 40)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM DiscrepancyLogs').fetchone()[0], 0)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM SyntheticGroundTruth').fetchone()[0], 120)
                self.assertEqual(conn.execute('SELECT COUNT(DISTINCT Scenario) FROM SyntheticGroundTruth').fetchone()[0], 4)

    def test_existing_database_is_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)/'existing.db'
            target.write_bytes(b'important-existing-database')
            with self.assertRaises(FileExistsError):
                generator.build_database(target, count=40)
            self.assertEqual(target.read_bytes(), b'important-existing-database')

    def test_seed_changes_data(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'a.db', Path(folder)/'b.db'
            generator.build_database(a, count=40, seed=42)
            generator.build_database(b, count=40, seed=43)
            self.assertNotEqual(db_fingerprint(a), db_fingerprint(b))

    def test_minimum_count(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                generator.build_database(Path(folder)/'new.db', count=3)


if __name__ == '__main__':
    unittest.main()
