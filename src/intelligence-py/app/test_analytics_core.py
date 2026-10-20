import unittest
import numpy as np
from app.analytics_core import evaluate_regressors


class AnalyticsCoreTests(unittest.TestCase):
    def test_deterministic_and_baseline(self):
        rng = np.random.default_rng(10)
        x = rng.normal(size=(90, 3))
        y = 4 * x[:, 0] - 2 * x[:, 1] + rng.normal(scale=.1, size=90)
        a = evaluate_regressors(x.tolist(), y.tolist())
        b = evaluate_regressors(x.tolist(), y.tolist())
        self.assertEqual(a, b)
        self.assertEqual(a['selected_model'], 'ridge')

    def test_invalid_rows(self):
        with self.assertRaises(ValueError):
            evaluate_regressors([[1.0]] * 5, [1.0] * 5)

    def test_temporal(self):
        x = [[float(i)] for i in range(50)]
        y = [float(i * 2) for i in range(50)]
        ts = [f'2025-01-{(i % 28) + 1:02d}T00:00:00+00:00' for i in range(50)]
        self.assertEqual(evaluate_regressors(x, y, timestamps=ts)['evaluations'][0]['split'], 'temporal')


if __name__ == '__main__':
    unittest.main()