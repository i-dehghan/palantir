import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from evaluate import evaluate

class EvaluationTests(unittest.TestCase):
    def test_ground_truth_mapping_and_confusion_matrix(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.db"
            with closing(sqlite3.connect(path)) as db:
                with db:
                    db.execute("CREATE TABLE SyntheticGroundTruth (Domain TEXT, RecordId TEXT, Scenario TEXT)")
                    db.execute('CREATE TABLE "DiscrepancyLogs" (DomainType TEXT, OrderRegNumber TEXT, RiskScore INTEGER)')
                    db.executemany("INSERT INTO SyntheticGroundTruth VALUES (?,?,?)", [
                        ("BANKING", "rrn1", "high"),
                        ("BANKING", "rrn2", "normal"),
                        ("BANKING", "rrn3", "network"),
                        ("CUSTOMS", "ord1", "moderate"),
                        ("TELECOM", "call1", "high"),
                    ])
                    db.executemany('INSERT INTO "DiscrepancyLogs" VALUES (?,?,?)', [
                        ("BANKING", "BANK-TX-rrn1", 96),
                        ("BANKING", "BANK-TX-rrn2", 89),
                        ("CUSTOMS", "ord1", 88),
                        ("TELECOM", "TEL-CALL-call1", 94),
                    ])
            result = evaluate(path)
            self.assertEqual(result["domains"]["BANKING"]["confusionMatrix"],
                             {"TP": 1, "FP": 1, "FN": 1, "TN": 0})
            self.assertEqual(result["domains"]["TELECOM"]["recall"], 1.0)
            self.assertEqual(result["domains"]["CUSTOMS"]["precision"], 0.0)

    def test_missing_db_not_created(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "missing.db"
            with self.assertRaises(FileNotFoundError):
                evaluate(path)
            self.assertFalse(path.exists())
