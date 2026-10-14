# مسیر فایل: intelligence-py/app/regression_engine.py

import numpy as np
from sklearn.linear_model import LogisticRegression, LinearRegression
from typing import List, Dict, Any

class ForensicRegressionEngine:
    def __init__(self):
        # آموزش اولیه مدل‌های پایه‌ای با داده‌های مرجع گمرکی و بانکی سامانه دیده‌بان
        # Features: [weight_kg, declared_value_usd, transaction_count, importer_violation_history_count]
        self.logistic_model = LogisticRegression()
        X_train_log = np.array([
            [1200, 45000, 2, 0],
            [3500, 110000, 15, 3],
            [500, 18000, 1, 0],
            [4200, 145000, 32, 5],
            [800, 25000, 4, 1]
        ])
        y_train_log = np.array([0, 1, 0, 1, 0])
        self.logistic_model.fit(X_train_log, y_train_log)

        # رگرسیون خطی چندمتغیره برای پیش‌بینی ارزش استاندارد بر اساس وزن و کد تعرفه
        # Features: [weight_kg, hs_code_category_encoded]
        self.linear_model = LinearRegression()
        X_train_lin = np.array([
            [1200, 8528],
            [3500, 8528],
            [500, 8418],
            [4500, 8528],
            [900, 8418]
        ])
        y_train_lin = np.array([50000, 120000, 22000, 155000, 35000])
        self.linear_model.fit(X_train_lin, y_train_lin)

    def calculate_violation_probability(self, weight: float, value_usd: float, tx_count: int, history_count: int) -> float:
        features = np.array([[weight, value_usd, tx_count, history_count]])
        prob = self.logistic_model.predict_proba(features)[0][1]
        return round(float(prob), 4)

    def evaluate_valuation_residual(self, weight: float, hs_category: int, declared_value: float) -> Dict[str, Any]:
        features = np.array([[weight, hs_category]])
        expected_value = self.linear_model.predict(features)[0]
        residual = declared_value - expected_value
        percentage_diff = (residual / expected_value) * 100 if expected_value > 0 else 0.0

        is_undervalued = percentage_diff < -25.0  # مغایرت بیش از ۲۵٪ پایین‌تر از خط رگرسیون استاندارد

        return {
            "expected_value_usd": round(float(expected_value), 2),
            "declared_value_usd": round(float(declared_value), 2),
            "residual_usd": round(float(residual), 2),
            "percentage_difference": round(float(percentage_diff), 2),
            "is_undervalued": is_undervalued,
            "risk_flag": "CRITICAL_UNDERVALUATION" if is_undervalued else "NORMAL"
        }

regression_engine = ForensicRegressionEngine()