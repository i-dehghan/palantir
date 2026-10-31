import importlib.util
from pathlib import Path
import unittest
import numpy as np

P = Path(__file__).with_name('run.py')
spec = importlib.util.spec_from_file_location('ood31713', P)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Tests(unittest.TestCase):
    def test_reproducibility(self):
        x1, y1 = mod.generate_ood(400, 31713)
        x2, y2 = mod.generate_ood(400, 31713)
        np.testing.assert_array_equal(x1, x2)
        np.testing.assert_array_equal(y1, y2)

    def test_balanced_labels(self):
        _, y = mod.generate_ood(400)
        self.assertEqual(int(y.sum()), 200)

    def test_independent_shift(self):
        x1, y1 = mod.generate_ood(4000, shift='overlap')
        x2, y2 = mod.generate_ood(4000, shift='inversion')
        self.assertGreater(float(x1[y1 == 1].mean()), float(x1[y1 == 0].mean()))
        self.assertLess(float(x2[y2 == 1].mean()), float(x2[y2 == 0].mean()))

    def test_confusion_matrix(self):
        m = mod.metrics(np.array([0, 0, 1, 1]), np.array([.1, .7, .3, .9]), .5)
        self.assertEqual(m['confusionMatrix'], {'TN': 1, 'FP': 1, 'FN': 1, 'TP': 1})

    def test_bad_size(self):
        with self.assertRaises(ValueError):
            mod.generate_ood(101)


if __name__ == '__main__':
    unittest.main()
