import importlib.util
import json
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('regression_runner', Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RegressionTests(unittest.TestCase):
    def test_same_timestamp_excluded(self):
        rows = [('a', 'A', '2026-01-01T00:00:00', 'u', 'v', 10, 0),
                ('b', 'A', '2026-01-01T00:00:00', 'u', 'v', 20, 1),
                ('c', 'A', '2026-01-02T00:00:00', 'u', 'v', 30, 0)]
        x, _ = runner.extract(rows)['A']
        self.assertEqual(x[0, 4], 0)
        self.assertEqual(x[1, 4], 0)
        self.assertAlmostEqual(x[2, 4], np.log1p(2))

    def test_threshold_fail_closed(self):
        self.assertIsNone(runner.select_threshold(np.array([0, 0, 1, 1]),
                                                   np.array([0.9, 0.8, 0.1, 0.2]), 0.8))

    def test_read_d_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 't.db'
            with closing(sqlite3.connect(db)) as conn:
                with conn:
                    conn.execute('CREATE TABLE SyntheticTelecomV3 (event_id TEXT, environment TEXT, event_time TEXT, caller TEXT, receiver TEXT, duration_seconds INT, synthetic_label INT)')
                    conn.executemany('INSERT INTO SyntheticTelecomV3 VALUES (?,?,?,?,?,?,?)',
                                     [(e, e, '2026-01-01', 'u', 'v', 10, 0) for e in 'ABCD'])
            self.assertEqual({r[1] for r in runner.read_development(db)}, {'A', 'B', 'C'})

    def test_manifest_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'fixture.db'; p.write_bytes(b'x')
            m = Path(d) / 'manifest.json'; m.write_text(json.dumps({'phase': '3.1.7.15', 'dbSha256': 'bad'}))
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                runner.evaluate(p, m)


if __name__ == '__main__':
    unittest.main()
