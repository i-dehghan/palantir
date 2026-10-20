
"""DIDEBAN Model Registry - metadata and lifecycle management."""

import json
import os
import re
import sqlite3

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_DB_PATH = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "model_registry.db"
)

VALID_STATES = {
    "CANDIDATE",
    "VALIDATED",
    "APPROVED",
    "RETIRED",
}

ALLOWED_TRANSITIONS = {
    "CANDIDATE": {"VALIDATED"},
    "VALIDATED": {"APPROVED"},
    "APPROVED": {"RETIRED"},
    "RETIRED": set(),
}

IDENTIFIER_PATTERN = re.compile(
    r"^[A-Za-z0-9_.-]{1,100}$"
)


class ModelRegistry:
    def __init__(self, db_path: Optional[str] = None):
        configured_path = (
            db_path
            if db_path is not None
            else os.getenv("DIDEBAN_MODEL_REGISTRY_DB")
        )

        self.db_path = (
            Path(configured_path)
            if configured_path
            else DEFAULT_DB_PATH
        )

        self.db_path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        self._initialize()

    def _connect(self):
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=15
        )

        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=15000")
        conn.execute("PRAGMA foreign_keys=ON")

        return conn

    @contextmanager
    def _connection(self):
        """
        Manage transactions and always close SQLite connections.

        Important on Windows because open connections prevent
        deletion of temporary database files.
        """
        conn = self._connect()

        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _initialize(self):
        with self._connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS model_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_name TEXT NOT NULL,
                    version TEXT NOT NULL,
                    algorithm TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'CANDIDATE',
                    metrics_json TEXT NOT NULL,
                    dataset_fingerprint TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(model_name, version)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS model_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_version_id INTEGER NOT NULL,
                    previous_status TEXT,
                    new_status TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(model_version_id)
                        REFERENCES model_versions(id)
                )
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_model_versions_status
                ON model_versions(status)
            """)

    @staticmethod
    def _timestamp():
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _validate_identifier(value: str, field: str):
        if (
            not isinstance(value, str)
            or not IDENTIFIER_PATTERN.fullmatch(value)
        ):
            raise ValueError(f"Invalid {field}")

    @staticmethod
    def _serialize_metrics(
        metrics: Dict[str, Any]
    ) -> str:
        if not isinstance(metrics, dict) or not metrics:
            raise ValueError(
                "metrics must be a nonempty dictionary"
            )

        if not all(
            isinstance(key, str) and key
            for key in metrics
        ):
            raise ValueError(
                "metric names must be nonempty strings"
            )

        try:
            return json.dumps(
                metrics,
                allow_nan=False,
                sort_keys=True
            )
        except (TypeError, ValueError) as exc:
            raise ValueError(
                "metrics must be JSON serializable"
            ) from exc

    @staticmethod
    def _to_dict(row):
        if row is None:
            return None

        result = dict(row)

        result["metrics"] = json.loads(
            result.pop("metrics_json")
        )

        return result

    def register_model(
        self,
        model_name: str,
        version: str,
        algorithm: str,
        metrics: Dict[str, Any],
        dataset_fingerprint: str,
        actor: str = "system",
    ) -> Dict[str, Any]:

        for field, value in {
            "model_name": model_name,
            "version": version,
            "algorithm": algorithm,
            "actor": actor,
        }.items():
            self._validate_identifier(value, field)

        if (
            not isinstance(dataset_fingerprint, str)
            or not re.fullmatch(
                r"[a-fA-F0-9]{64}",
                dataset_fingerprint
            )
        ):
            raise ValueError(
                "dataset_fingerprint must be a SHA-256 hex digest"
            )

        metrics_json = self._serialize_metrics(metrics)
        now = self._timestamp()

        with self._connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO model_versions (
                    model_name,
                    version,
                    algorithm,
                    status,
                    metrics_json,
                    dataset_fingerprint,
                    created_at,
                    updated_at
                )
                VALUES (
                    ?, ?, ?, 'CANDIDATE',
                    ?, ?, ?, ?
                )
                """,
                (
                    model_name,
                    version,
                    algorithm,
                    metrics_json,
                    dataset_fingerprint.lower(),
                    now,
                    now,
                ),
            )

            model_id = cursor.lastrowid

            conn.execute(
                """
                INSERT INTO model_events (
                    model_version_id,
                    previous_status,
                    new_status,
                    actor,
                    reason,
                    created_at
                )
                VALUES (
                    ?, NULL, 'CANDIDATE',
                    ?, ?, ?
                )
                """,
                (
                    model_id,
                    actor,
                    "Model registered",
                    now,
                ),
            )

        return self.get_model(model_name, version)

    def get_model(
        self,
        model_name: str,
        version: str,
    ) -> Optional[Dict[str, Any]]:

        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM model_versions
                WHERE model_name = ?
                  AND version = ?
                """,
                (model_name, version),
            ).fetchone()

        return self._to_dict(row)

    def list_models(self):
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM model_versions
                ORDER BY id DESC
                """
            ).fetchall()

        return [
            self._to_dict(row)
            for row in rows
        ]

    def transition_status(
        self,
        model_name: str,
        version: str,
        new_status: str,
        actor: str,
        reason: str,
    ) -> Dict[str, Any]:

        if new_status not in VALID_STATES:
            raise ValueError("Invalid model status")

        self._validate_identifier(actor, "actor")

        if (
            not isinstance(reason, str)
            or not reason.strip()
        ):
            raise ValueError(
                "A transition reason is required"
            )

        now = self._timestamp()

        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT id, status
                FROM model_versions
                WHERE model_name = ?
                  AND version = ?
                """,
                (model_name, version),
            ).fetchone()

            if row is None:
                raise ValueError("Model version not found")

            previous_status = row["status"]

            if new_status not in ALLOWED_TRANSITIONS.get(
                previous_status, set()
            ):
                raise ValueError(
                    f"Invalid transition: "
                    f"{previous_status} -> {new_status}"
                )

            conn.execute(
                """
                UPDATE model_versions
                SET status = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (new_status, now, row["id"]),
            )

            conn.execute(
                """
                INSERT INTO model_events (
                    model_version_id,
                    previous_status,
                    new_status,
                    actor,
                    reason,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    previous_status,
                    new_status,
                    actor,
                    reason.strip(),
                    now,
                ),
            )

        return self.get_model(model_name, version)

    def get_events(
        self,
        model_name: str,
        version: str
    ):
        model = self.get_model(model_name, version)

        if model is None:
            return []

        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    previous_status,
                    new_status,
                    actor,
                    reason,
                    created_at
                FROM model_events
                WHERE model_version_id = ?
                ORDER BY id
                """,
                (model["id"],),
            ).fetchall()

        return [
            dict(row)
            for row in rows
        ]
