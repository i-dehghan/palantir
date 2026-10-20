
import hashlib
import tempfile
import unittest
from pathlib import Path

from app.model_registry import ModelRegistry


class ModelRegistryTests(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(
            Path(self.temp_dir.name) / "registry_test.db"
        )
        self.registry = ModelRegistry(self.db_path)
        self.fingerprint = hashlib.sha256(
            b"synthetic-test-dataset"
        ).hexdigest()

    def tearDown(self):
        self.temp_dir.cleanup()

    def register(self):
        return self.registry.register_model(
            model_name="waybill_regression",
            version="1.0.0",
            algorithm="ridge",
            metrics={
                "mae": 12.5,
                "rmse": 17.2,
                "baseline_mae": 20.0,
            },
            dataset_fingerprint=self.fingerprint,
            actor="test_runner",
        )

    def test_registration(self):
        model = self.register()
        self.assertEqual(model["status"], "CANDIDATE")
        self.assertEqual(model["algorithm"], "ridge")

    def test_persistence(self):
        self.register()

        reopened = ModelRegistry(self.db_path)
        model = reopened.get_model(
            "waybill_regression", "1.0.0"
        )

        self.assertIsNotNone(model)
        self.assertEqual(model["metrics"]["mae"], 12.5)

    def test_duplicate_version_rejected(self):
        self.register()

        with self.assertRaises(Exception):
            self.register()

    def test_lifecycle(self):
        self.register()

        self.registry.transition_status(
            "waybill_regression",
            "1.0.0",
            "VALIDATED",
            "test_runner",
            "Independent evaluation completed",
        )

        model = self.registry.transition_status(
            "waybill_regression",
            "1.0.0",
            "APPROVED",
            "test_reviewer",
            "Review completed",
        )

        self.assertEqual(model["status"], "APPROVED")

        events = self.registry.get_events(
            "waybill_regression", "1.0.0"
        )
        self.assertEqual(len(events), 3)

    def test_invalid_transition(self):
        self.register()

        with self.assertRaises(ValueError):
            self.registry.transition_status(
                "waybill_regression",
                "1.0.0",
                "APPROVED",
                "test_runner",
                "Skip validation",
            )

    def test_invalid_metrics(self):
        with self.assertRaises(ValueError):
            self.registry.register_model(
                "test_model",
                "1.0.0",
                "ridge",
                {"mae": float("nan")},
                self.fingerprint,
            )


if __name__ == "__main__":
    unittest.main()
