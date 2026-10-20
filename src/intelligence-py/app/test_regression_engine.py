import unittest

from app.regression_engine import ForensicRegressionEngine


class RegressionEngineTests(unittest.TestCase):

    def setUp(self):
        self.engine = ForensicRegressionEngine()

    def test_model_not_trained_at_startup(self):
        self.assertIsNone(self.engine.logistic_model)
        self.assertIsNone(self.engine.linear_model)
        self.assertEqual(
            self.engine.model_status,
            "NOT_CONFIGURED"
        )

    def test_probability_unavailable_without_model(self):
        result = self.engine.calculate_violation_probability(
            weight=1200,
            value_usd=45000,
            tx_count=2,
            history_count=0,
        )
        self.assertIsNone(result)

    def test_valuation_unavailable_without_model(self):
        result = self.engine.evaluate_valuation_residual(
            weight=1200,
            hs_category=8528,
            declared_value=45000,
        )

        self.assertEqual(
            result["risk_flag"],
            "NOT_EVALUATED"
        )
        self.assertIsNone(result["expected_value_usd"])
        self.assertIsNone(result["is_undervalued"])

    def test_rejects_negative_values(self):
        with self.assertRaises(ValueError):
            self.engine.calculate_violation_probability(
                weight=-100,
                value_usd=45000,
                tx_count=2,
                history_count=0,
            )

    def test_rejects_non_finite_values(self):
        with self.assertRaises(ValueError):
            self.engine.evaluate_valuation_residual(
                weight=float("nan"),
                hs_category=8528,
                declared_value=45000,
            )


if __name__ == "__main__":
    unittest.main()