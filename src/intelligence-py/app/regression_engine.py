"""
DIDEBAN Forensic Regression Engine.

Provides backward-compatible interfaces for existing FastAPI routes.

No model is trained from embedded sample records.
Predictions remain unavailable until a validated model is
integrated through the approved model lifecycle.
"""

from typing import Any, Dict, Optional
import math


class ForensicRegressionEngine:
    """Compatibility layer for DIDEBAN regression endpoints."""

    def __init__(self) -> None:
        self.logistic_model = None
        self.linear_model = None
        self.model_status = "NOT_CONFIGURED"
        self.model_version: Optional[str] = None

    @staticmethod
    def _validate_number(
        value: float,
        name: str,
        *,
        non_negative: bool = True,
    ) -> float:
        if isinstance(value, bool):
            raise ValueError(f"{name} must be numeric")

        try:
            number = float(value)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"{name} must be numeric") from exc

        if not math.isfinite(number):
            raise ValueError(f"{name} must be finite")

        if non_negative and number < 0:
            raise ValueError(f"{name} cannot be negative")

        return number

    def calculate_violation_probability(
        self,
        weight: float,
        value_usd: float,
        tx_count: int,
        history_count: int,
    ) -> Optional[float]:
        """
        Preserve the existing return contract.

        None indicates that no validated probability model
        is available. It must not be interpreted as zero risk.
        """
        self._validate_number(weight, "weight")
        self._validate_number(value_usd, "value_usd")
        self._validate_number(tx_count, "tx_count")
        self._validate_number(history_count, "history_count")

        return None

    def evaluate_valuation_residual(
        self,
        weight: float,
        hs_category: int,
        declared_value: float,
    ) -> Dict[str, Any]:
        """
        Preserve the existing response keys.

        Valuation conclusions are unavailable until a
        validated valuation model has been deployed.
        """
        self._validate_number(weight, "weight")
        self._validate_number(hs_category, "hs_category")
        self._validate_number(declared_value, "declared_value")

        return {
            "expected_value_usd": None,
            "declared_value_usd": round(float(declared_value), 2),
            "residual_usd": None,
            "percentage_difference": None,
            "is_undervalued": None,
            "risk_flag": "NOT_EVALUATED",
            "model_status": self.model_status,
            "model_version": self.model_version,
            "reason": "VALIDATED_MODEL_NOT_AVAILABLE",
        }


regression_engine = ForensicRegressionEngine()