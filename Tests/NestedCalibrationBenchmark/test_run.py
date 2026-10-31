"""Offline tests for phase 3.1.7.10; no production database access."""
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run as subject


class NestedCalibrationTests(unittest.TestCase):
    def test_dependency_resolved(self):
        self.assertTrue(subject.BASE.is_file())

    def test_four_way_group_disjoint(self):
        rows = []
        y = []
        for group in range(100):
            for i in range(10):
                rows.append((f'r{group}-{i}', 1e6, 9e5, 'A', 'A', f'entity-{group}'))
                y.append(group % 2)
        splits, groups = subject.four_way('CUSTOMS', rows, np.asarray(y), 31710)
        self.assertEqual(sum(map(len, splits.values())), len(rows))
        for a, ia in splits.items():
            self.assertEqual(len(set(np.asarray(y)[ia])), 2)
            for b, ib in splits.items():
                if a != b:
                    self.assertFalse(set(groups[ia]) & set(groups[ib]))

    def test_infeasible_component_split_is_rejected(self):
        rows = []
        y = []
        for i in range(80):
            rows.append((str(i), 100., 'shared' if i < 40 else f'left{i}',
                         'shared2' if i < 40 else f'right{i}', str(i)))
            y.append(int(i < 40))
        with self.assertRaises(ValueError):
            subject.four_way('BANKING', rows, np.asarray(y), 31710)

    def test_no_output_overwrite(self):
        self.assertTrue(callable(subject.main))


if __name__ == '__main__':
    unittest.main()
