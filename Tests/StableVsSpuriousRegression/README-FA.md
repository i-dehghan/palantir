# فاز 3.1.7.19 — Stable vs Spurious Regression

آزمایش صرفاً روی داده‌های **مصنوعی** Fixture V4 است. دیتابیس ورودی فقط خواندنی است؛ هیچ جدول یا داده‌ای بازنویسی نمی‌شود.

- A: آموزش LogisticRegression و StandardScaler
- B: کالیبراسیون sigmoid با FrozenEstimator
- C: انتخاب مدل و آستانه با شرط Precision >= 0.8
- D: هیچ ردیفی از آن خوانده نمی‌شود. ارزیابی نهایی در این مرحله ممنوع است.

سه مدل `duration_only`، `context_only` و `combined` مقایسه می‌شوند. نتایج C به دلیل انتخاب مدل/آستانه روی همان داده، تخمین مستقل عملکرد نیستند. `context_score` عمداً در مولد مصنوعی با برچسب رابطه دارد و کاربرد عملی را اثبات نمی‌کند.

نیازمندی: Python 3.12، numpy، scikit-learn >= 1.6.

```powershell
python -m unittest discover -s .\Tests\StableVsSpuriousRegression -p "test_*.py" -v
python .\Tests\StableVsSpuriousRegression\run.py `
  --db .\data\benchmark_3175\fixture_v4_31718\synthetic_fixture_v4_31718.db `
  --manifest .\data\benchmark_3175\fixture_v4_31718\fixture_v4_manifest_31718.json `
  --out .\data\benchmark_3175\stable-vs-spurious-report-31719.json
```

خروجی موجود بازنویسی نمی‌شود. هیچ تغییری در Angular، .NET یا دیتابیس عملیاتی انجام نمی‌شود.
