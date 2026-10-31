# DIDEBAN — Phase 3.1.7.16

آزمایش آفلاین صرفاً با داده مصنوعی. بدون تغییر دیتابیس عملیاتی یا Backend/Frontend.

## پروتکل

- A: train logistic regression with StandardScaler.
- B: sigmoid probability calibration using FrozenEstimator.
- C: precision-constrained threshold and candidate selection.
- D: **not queried**. Do not inspect D until the protocol and artifact are frozen.
- Historical caller/pair counts use only earlier timestamps within each environment; simultaneous events do not see one another.
- Minimum precision is 0.80; if infeasible, fail closed.
- The candidate selected on C is NOT an independent test result. Operational deployment remains NO-GO.

Requires Python 3.10+, numpy and scikit-learn 1.6+ (tested with 1.8).

```powershell
python -m unittest discover -s .\Tests\MultiEnvironmentRegression -p 'test_*.py' -v
python .\Tests\MultiEnvironmentRegression\run.py `
  --db .\data\benchmark_3175\fixture_v3_31715\synthetic_fixture_v3_31715.db `
  --manifest .\data\benchmark_3175\fixture_v3_31715\fixture_v3_manifest_31715.json `
  --out .\data\benchmark_3175\regression-report-31716.json
```

No overwrite: use a fresh report path if one already exists. Do not use environment D for feature selection, debugging, or threshold tuning.
