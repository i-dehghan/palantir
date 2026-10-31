import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('phase31719_run', Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RegressionTests(unittest.TestCase):
    def test_threshold_fail_closed(self):
        self.assertIsNone(runner.select_threshold(np.array([0, 0, 1, 0]),
                                                   np.array([0.9, 0.8, 0.1, 0.7]), 0.8))

    def test_threshold_with_ties(self):
        self.assertEqual(runner.select_threshold(np.array([1, 0, 1]),
                                                 np.array([0.9, 0.9, 0.2]), 0.5), 0.2)

    def test_read_excludes_d_and_closes_sqlite(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'temp.db'
            with closing(sqlite3.connect(db)) as conn:
                conn.execute('CREATE TABLE SyntheticTelecomV4 (environment TEXT, duration_seconds INTEGER, context_score REAL, synthetic_label INTEGER, event_time TEXT, event_id TEXT)')
                conn.executemany('INSERT INTO SyntheticTelecomV4 VALUES (?,?,?,?,?,?)',
                                 [(e, 30, 0.5, 1, '2026-01-01', e) for e in 'ABCD'])
                conn.commit()
            rows = runner.read_development(db)
            self.assertEqual({r[0] for r in rows}, set('ABC'))
        self.assertFalse(db.exists())

    def test_manifest_mismatch(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'empty.db'; db.write_bytes(b'not-a-database')
            manifest = Path(folder) / 'manifest.json'
            manifest.write_text(json.dumps({'phase': '3.1.7.18', 'dbSha256': 'wrong'}))
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                runner.evaluate(db, manifest)

    def test_prepare_rejects_missing_environment(self):
        with self.assertRaises(ValueError):
            runner.prepare([('A', 10, 0.1, 0)] * 60)


if __name__ == '__main__':
    unittest.main()
