import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run


class DiagnosticsTests(unittest.TestCase):
    def test_summary(self):
        result = run.summarize([0, 1, 2])
        self.assertEqual(result['count'], 3)
        self.assertAlmostEqual(result['zeroFraction'], 1 / 3, places=6)

    def test_provenance_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db = root / 'test.db'
            db.write_bytes(b'test')
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'dbSha256': 'invalid'}))
            regression = root / 'regression.json'
            regression.write_text(json.dumps({'dbSha256': 'invalid'}))
            with self.assertRaises(ValueError):
                run.audit(db, manifest, regression)

    def test_no_d_access_in_reader(self):
        # A deliberately incompatible D-only table would fail if queried.
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'test.db'
            with closing(sqlite3.connect(db)) as conn:
                with conn:
                    conn.execute('CREATE TABLE SyntheticTelecomV3(event_id INTEGER, environment TEXT, event_time TEXT, caller TEXT, receiver TEXT, duration_seconds REAL, synthetic_label INTEGER)')
                    conn.execute("INSERT INTO SyntheticTelecomV3 VALUES(1,'D','2026-01-01','x','y',1,1)")
            self.assertEqual(run.read_development(db), [])

    def test_no_training(self):
        self.assertFalse(hasattr(run, 'LogisticRegression'))
        self.assertFalse(hasattr(run, 'CalibratedClassifierCV'))


if __name__ == '__main__':
    unittest.main()
