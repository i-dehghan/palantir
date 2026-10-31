import tempfile
import unittest
from pathlib import Path
from run import evaluate, score
import numpy as np

class RobustnessTests(unittest.TestCase):
    def test_missing_db_never_created(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'missing.db'
            with self.assertRaises(FileNotFoundError):
                evaluate(p)
            self.assertFalse(p.exists())

    def test_metrics_are_bounded(self):
        metrics = score(np.array([0, 0, 1, 1]), np.array([.1, .4, .6, .9]))
        self.assertEqual(metrics['f1'], 1)
        self.assertTrue(0 <= metrics['brier'] <= 1)
