"""Deterministic, auditable regression model selection for numeric tabular data.

No training on fabricated records; no person-level risk labels. Caller owns dataset
provenance, authorization and intended use. Temporal holdout prevents future leakage.
"""
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional
import numpy as np
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler


@dataclass(frozen=True)
class Evaluation:
    model: str
    mae: float
    rmse: float
    baseline_mae: float
    beats_baseline: bool
    train_rows: int
    test_rows: int
    split: str
    seed: int


def evaluate_regressors(
    features: List[List[Optional[float]]],
    targets: List[float],
    *,
    timestamps: Optional[List[str]] = None,
    test_fraction: float = 0.2,
    seed: int = 42,
) -> Dict[str, Any]:
    """Evaluate candidate regressors without persisting models or returning personal predictions.

    With timestamps, samples are sorted lexicographically (ISO-8601 UTC expected)
    and the newest observations are held out. Otherwise deterministic random split.
    """
    x = np.asarray(features, dtype=float)
    y = np.asarray(targets, dtype=float)
    if x.ndim != 2 or x.shape[1] == 0 or x.shape[0] < 30:
        raise ValueError('At least 30 rows and one numeric feature are required')
    if y.shape != (x.shape[0],) or not np.isfinite(y).all():
        raise ValueError('Targets must be finite and match feature row count')
    if np.isinf(x).any() or np.isnan(x).all(axis=0).any():
        raise ValueError('Features cannot contain infinities or entirely missing columns')
    if not 0.1 <= test_fraction <= 0.4:
        raise ValueError('test_fraction must be between 0.1 and 0.4')
    if timestamps is not None:
        if len(timestamps) != len(y) or any(not isinstance(t, str) or not t for t in timestamps):
            raise ValueError('timestamps must contain one nonempty ISO timestamp per row')
        from datetime import datetime, timezone
        try:
            parsed = [datetime.fromisoformat(t.replace('Z', '+00:00')).astimezone(timezone.utc)
                      if datetime.fromisoformat(t.replace('Z', '+00:00')).tzinfo
                      else (_ for _ in ()).throw(ValueError('timezone required')) for t in timestamps]
        except (TypeError, ValueError) as exc:
            raise ValueError('timestamps must be timezone-aware ISO-8601 strings') from exc
        order = np.array(sorted(range(len(parsed)), key=lambda i: parsed[i]), dtype=int)
        split = 'temporal'
    else:
        order = np.random.default_rng(seed).permutation(len(y))
        split = 'random'
    cut = len(y) - max(1, int(np.ceil(len(y) * test_fraction)))
    train, test = order[:cut], order[cut:]
    candidates = {
        'ridge': make_pipeline(SimpleImputer(strategy='median'), StandardScaler(), Ridge()),
        'random_forest': make_pipeline(SimpleImputer(strategy='median'), RandomForestRegressor(
            n_estimators=100, min_samples_leaf=3, random_state=seed, n_jobs=1)),
        'hist_gradient_boosting': make_pipeline(SimpleImputer(strategy='median'),
            HistGradientBoostingRegressor(max_iter=100, min_samples_leaf=10, random_state=seed)),
    }
    baseline = DummyRegressor(strategy='median').fit(x[train], y[train])
    baseline_mae = float(mean_absolute_error(y[test], baseline.predict(x[test])))
    results = []
    for name, estimator in candidates.items():
        model = clone(estimator).fit(x[train], y[train])
        pred = model.predict(x[test])
        results.append(Evaluation(name, float(mean_absolute_error(y[test], pred)),
                                  float(np.sqrt(mean_squared_error(y[test], pred))),
                                  baseline_mae, False, len(train), len(test), split, seed))
    results.sort(key=lambda r: (r.mae, r.rmse, r.model))
    report = [dict(asdict(r), beats_baseline=r.mae < baseline_mae) for r in results]
    return {'selected_model': results[0].model if results[0].mae < baseline_mae else None,
            'status': 'candidate' if results[0].mae < baseline_mae else 'baseline_not_beaten',
            'evaluations': report, 'baseline_mae': baseline_mae,
            'warning': 'Holdout evaluation only; validate on independent datasets before deployment.'}