import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run

class DiagnosticsTests(unittest.TestCase):
    def test_distribution(self):
        d = run.distribution(np.array([[0., 2.], [2., 4.]]), ['a', 'b'], np.array([0, 1]))
        self.assertEqual(d['a']['mean'], 1)
        self.assertEqual(d['a']['zeroRate'], .5)
    def test_shift(self):
        x = np.array([[1.], [3.], [5.]])
        d = run.standardized_mean_shift(x, ['a'], np.array([0, 1]), np.array([2]))
        self.assertEqual(d['a'], 3.)
    def test_no_nan(self):
        with self.assertRaises(ValueError):
            run.distribution(np.array([[float('nan')]]), ['a'], np.array([0]))
    def test_causal_equal_timestamp(self):
        rows = [('a', 20, 'A', 'B', '2026-01-01T00:00:00', 'normal'),
                ('b', 40, 'A', 'C', '2026-01-01T00:00:00', 'high'),
                ('c', 60, 'A', 'D', '2026-01-02T00:00:00', 'normal')]
        x, names = run.previous.causal_features(rows)
        self.assertEqual(x[0, names.index('caller_calls_1d')], 0)
        self.assertEqual(x[1, names.index('caller_calls_1d')], 0)
        self.assertEqual(x[2, names.index('caller_calls_30d')], 2)

if __name__ == '__main__': unittest.main()
