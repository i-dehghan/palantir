"""Unit and report integration checks for aggregate-only phase 3.1.7.14."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('failure_audit', Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class FailureAuditTests(unittest.TestCase):
    def setUp(self):
        self.base = Path(__file__).resolve().parents[2]
        self.reports = [self.base / 'data' / 'benchmark_3175' / f for f in (
            'temporal-feature-report-31711.json',
            'temporal-diagnostics-report-31712.json',
            'independent-ood-report-31713.json')]

    def test_invalid_phase_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / 'report.json'
            p.write_text('{"phase":"wrong","readOnly":true}', encoding='utf-8')
            with self.assertRaises(ValueError):
                runner.read_report(p, '3.1.7.11')

    def test_confusion_consistency(self):
        case = {'rows': 10, 'positives': 5, 'selectedThreshold': {
            'rocAuc': .5, 'prAuc': .5, 'brier': .25, 'precision': .5, 'recall': .2, 'f1': .285714,
            'confusionMatrix': {'TN': 4, 'FP': 1, 'FN': 4, 'TP': 1}}}
        self.assertEqual(runner.validate_confusion(case, 'mock')['TP'], 1)
        case['selectedThreshold']['confusionMatrix']['TP'] = 2
        with self.assertRaises(ValueError):
            runner.validate_confusion(case, 'mock')

    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / 'source.json'
            p.write_text('{}')
            with self.assertRaises(ValueError):
                runner.safe_output(p, [p])
            with self.assertRaises(FileExistsError):
                runner.safe_output(p, [])

    def test_summary_equality_not_row_equality(self):
        d = {s: {'a': {'mean': 1, 'std': 0, 'median': 1, 'p05': 1, 'p95': 1, 'zeroRate': 0, 'uniqueValues': 1},
                 'b': {'mean': 1, 'std': 0, 'median': 1, 'p05': 1, 'p95': 1, 'zeroRate': 0, 'uniqueValues': 1}}
             for s in ('train', 'calibratorFit', 'policySelection', 'test')}
        self.assertTrue(runner.identical_summary_columns(d, 'a', 'b'))
        d['test']['b']['mean'] = 2
        self.assertFalse(runner.identical_summary_columns(d, 'a', 'b'))

    def test_real_reports_if_present(self):
        if not all(p.is_file() for p in self.reports):
            self.skipTest('Local benchmark reports not present; run CLI integration with supplied reports')
        docs = [runner.read_report(p, phase) for p, phase in zip(self.reports, runner.EXPECTED.values())]
        result = runner.audit(*docs)
        self.assertEqual(result['decision']['operationalDeployment'], 'NO_GO')
        self.assertFalse(result['oodCases']['overlap']['precisionConstraintMet'])
        self.assertFalse(result['oodCases']['inversion']['precisionConstraintMet'])
        self.assertEqual(result['featureAudit']['policySelectedCandidate'], 'duration_only')
        tampered = copy.deepcopy(docs[2])
        tampered['frozenSpecification']['threshold'] = .1
        with self.assertRaises(ValueError):
            runner.audit(docs[0], docs[1], tampered)


if __name__ == '__main__':
    unittest.main()
