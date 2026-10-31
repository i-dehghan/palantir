# DIDEBAN Phase 3.1.7.7 — Robustness Diagnostics

این مرحله مستقل و فقط خواندنی است. از همان ویژگی‌های `Tests/RegressionBenchmark/run.py` استفاده می‌کند.

**توجه:** آزمون نویز، OOD مستقل نیست؛ برچسب‌های دیتاست اصلی را حفظ می‌کند و فقط حساسیت مدل را به تغییر اندازه‌گیری بررسی می‌کند. Group split با شناسه مصنوعی ملی انجام می‌شود، نه با مؤلفه‌های متصل گراف. نتیجه ۱۰۰٪ روی داده مصنوعی به معنی آمادگی تولید نیست.

از ریشه پروژه:

```powershell
python -m unittest discover -s .\Tests\RobustnessBenchmark -p "test_*.py" -v
python .\Tests\RobustnessBenchmark\run.py `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\robustness-report-3177.json
```

پیش‌نیاز: `numpy` و `scikit-learn` از فاز قبل نصب شده باشند.
