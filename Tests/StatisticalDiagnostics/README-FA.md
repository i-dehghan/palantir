# فاز 3.1.7.17 — Statistical Diagnostics & Model Failure Analysis

این ابزار فقط روی داده‌های مصنوعی A/B/C کار می‌کند؛ محیط D را نمی‌خواند. هیچ مدل یا آستانه‌ای آموزش یا انتخاب نمی‌شود. کد فاز 3.1.7.16 را صرفاً برای استخراج ویژگی‌های past-only و خواندن A/B/C وارد می‌کند.

## نصب

پوشه `Tests/StatisticalDiagnostics` را در ریشه پروژه قرار دهید؛ `Tests/MultiEnvironmentRegression/run.py` باید موجود باشد. نیازمندی‌ها: `numpy` و `scikit-learn`.

## تست

```powershell
python -m unittest discover -s .\Tests\StatisticalDiagnostics -p "test_*.py" -v
```

## اجرا

```powershell
python .\Tests\StatisticalDiagnostics\run.py `
  --db .\data\benchmark_3175\fixture_v3_31715\synthetic_fixture_v3_31715.db `
  --manifest .\data\benchmark_3175\fixture_v3_31715\fixture_v3_manifest_31715.json `
  --regression .\data\benchmark_3175\regression-report-31716.json `
  --out .\data\benchmark_3175\statistical-diagnostics-report-31717.json
```

## تفسیر

AUC تک‌ویژگی فقط قدرت رتبه‌بندی توصیفی را می‌سنجد. معیارهای C از گزارش 3.1.7.16 نقل می‌شوند و به علت انتخاب مدل/آستانه روی C ارزیابی مستقل نیستند. منحنی کالیبراسیون بدون احتمال‌های ذخیره‌شده برای هر ردیف قابل بازیابی نیست. هیچ ادعایی درباره عملکرد عملیاتی وجود ندارد.
