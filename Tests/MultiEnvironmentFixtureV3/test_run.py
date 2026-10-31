import importlib.util
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixture31715', Path(__file__).with_name('run.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FixtureTests(unittest.TestCase):
    def test_reproducibility(self):
        a, at = mod.make_rows(31715, 150, 24)
        b, bt = mod.make_rows(31715, 150, 24)
        self.assertEqual(a, b)
        self.assertEqual(at, bt)

    def test_environment_isolation(self):
        rows, _ = mod.make_rows(31715, 150, 24)
        for e in mod.ENVIRONMENTS:
            x = [r for r in rows if r[1] == e]
            self.assertEqual(len(x), 150)
            self.assertTrue(all(r[3].startswith(e + '-') and r[4].startswith(e + '-') for r in x))
        self.assertLess(max(r[2] for r in rows if r[1] == 'A'),
                        min(r[2] for r in rows if r[1] == 'B'))

    def test_repeated_pairs(self):
        rows, _ = mod.make_rows(31715, 250, 24)
        self.assertTrue(all(v['repeatedPairs'] > 0 for v in mod.audit(rows).values()))

    def test_topology_independent_of_label_seed(self):
        a, _ = mod.make_rows(31715, 150, 24, label_seed=10)
        b, _ = mod.make_rows(31715, 150, 24, label_seed=20)
        self.assertEqual([(r[1], r[2], r[3], r[4]) for r in a],
                         [(r[1], r[2], r[3], r[4]) for r in b])
        self.assertNotEqual([r[6] for r in a], [r[6] for r in b])

    def test_write_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            result = mod.generate(d, rows_per_env=150, nodes=24)
            self.assertEqual(len(result['audit']), 4)
            db = Path(d) / 'synthetic_fixture_v3_31715.db'
            with closing(sqlite3.connect(f'file:{db}?mode=ro', uri=True)) as conn:
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM SyntheticTelecomV3').fetchone()[0], 600)
            with self.assertRaises(FileExistsError):
                mod.generate(d, rows_per_env=150, nodes=24)
            self.assertEqual(result['dbSha256'], mod.sha256(db))


if __name__ == '__main__':
    unittest.main()
