
"""HTTP integration tests for DIDEBAN Model Registry API."""

import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.model_registry import ModelRegistry
from app.model_registry_api import get_registry


class ModelRegistryApiTests(unittest.TestCase):
    API_PREFIX = "/api/v1/model-registry"
    TEST_API_KEY = "dideban-registry-integration-test-key-2026"

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(
            Path(self.temp_dir.name) / "registry_api_test.db"
        )

        self.registry = ModelRegistry(self.db_path)

        self.fingerprint = hashlib.sha256(
            b"synthetic-http-test-dataset"
        ).hexdigest()

        self.env_patch = patch.dict(
            os.environ,
            {"DIDEBAN_REGISTRY_API_KEY": self.TEST_API_KEY},
        )
        self.env_patch.start()

        app.dependency_overrides[get_registry] = (
            lambda: self.registry
        )

        self.client = TestClient(
            app,
            raise_server_exceptions=False,
        )

        self.headers = {
            "X-Registry-Key": self.TEST_API_KEY
        }

    def tearDown(self):
        try:
            self.client.close()
        finally:
            app.dependency_overrides.pop(
                get_registry,
                None,
            )
            self.env_patch.stop()
            self.temp_dir.cleanup()

    def register_model(self):
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

    def test_list_models_with_valid_key(self):
        response = self.client.get(
            f"{self.API_PREFIX}/models",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_missing_key_rejected(self):
        response = self.client.get(
            f"{self.API_PREFIX}/models"
        )

        self.assertEqual(response.status_code, 401)

    def test_invalid_key_rejected(self):
        response = self.client.get(
            f"{self.API_PREFIX}/models",
            headers={
                "X-Registry-Key": "invalid-key"
            },
        )

        self.assertEqual(response.status_code, 401)

    def test_missing_server_configuration(self):
        with patch.dict(
            os.environ,
            {"DIDEBAN_REGISTRY_API_KEY": ""},
        ):
            response = self.client.get(
                f"{self.API_PREFIX}/models",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 503)

    def test_unknown_model_returns_404(self):
        response = self.client.get(
            f"{self.API_PREFIX}/models/"
            "unknown_model/1.0.0",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 404)

    def test_registered_model_is_listed(self):
        self.register_model()

        response = self.client.get(
            f"{self.API_PREFIX}/models",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)

        models = response.json()

        self.assertEqual(len(models), 1)
        self.assertEqual(
            models[0]["model_name"],
            "waybill_regression",
        )
        self.assertEqual(
            models[0]["status"],
            "CANDIDATE",
        )
        self.assertEqual(
            models[0]["metrics"]["mae"],
            12.5,
        )

    def test_model_details(self):
        self.register_model()

        response = self.client.get(
            f"{self.API_PREFIX}/models/"
            "waybill_regression/1.0.0",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["algorithm"],
            "ridge",
        )

    def test_model_events(self):
        self.register_model()

        self.registry.transition_status(
            model_name="waybill_regression",
            version="1.0.0",
            new_status="VALIDATED",
            actor="test_reviewer",
            reason="Independent evaluation completed",
        )

        response = self.client.get(
            f"{self.API_PREFIX}/models/"
            "waybill_regression/1.0.0/events",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)

        events = response.json()

        self.assertEqual(len(events), 2)
        self.assertEqual(
            events[0]["new_status"],
            "CANDIDATE",
        )
        self.assertEqual(
            events[1]["new_status"],
            "VALIDATED",
        )

    def test_unknown_model_events_returns_404(self):
        response = self.client.get(
            f"{self.API_PREFIX}/models/"
            "unknown_model/1.0.0/events",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
