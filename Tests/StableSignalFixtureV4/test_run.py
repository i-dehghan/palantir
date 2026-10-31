import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixture_v4', Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class FixtureTests(unittest.TestCase):
    def test_reproducibility(self):
        self.assertEqual(runner.make_rows(10, 100, 12), runner.make_rows(10, 100, 12))

    def test_topology_independent_of_label_seed(self):
        a = runner.make_rows(10, 100, 12, label_seed=1)
        b = runner.make_rows(10, 100, 12, label_seed=2)
        self.assertEqual([r[:5] + (r[6],) for r in a], [r[:5] + (r[6],) for r in b])
        self.assertNotEqual([r[7] for r in a], [r[7] for r in b])

    def test_environment_isolation(self):
        rows = runner.make_rows(10, 100, 12)
        endpoints = {e: {n for r in rows if r[1] == e for n in (r[3], r[4])} for e in 'ABCD'}
        for i, e in enumerate('ABCD'):
            for other in 'ABCD'[i+1:]:
                self.assertFalse(endpoints[e] & endpoints[other])

    def test_sqlite_cleanup_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = runner.generate(tmp, rows_per_env=100, nodes=12)
            db = Path(tmp) / 'synthetic_fixture_v4_31718.db'
            self.assertEqual(result['dbSha256'], runner.sha256(db))
            self.assertNotIn('positiveRate', result['audit']['D'])
            with closing(sqlite3.connect(db)) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM SyntheticTelecomV4').fetchone()[0], 400)
            with self.assertRaises(FileExistsError):
                runner.generate(tmp, rows_per_env=100, nodes=12)

    def test_repeated_pairs(self):
        rows = runner.make_rows(10, 200, 12)
        self.assertTrue(all(runner.summarize(rows)[e]['repeatedPairs'] > 0 for e in 'ABCD'))


if __name__ == '__main__':
    unittest.main()
