# DIDEBAN 3.1.7.13 — Synthetic Independent Generator OOD

این بسته صرفاً یک **آزمایش مستقل مصنوعی** است؛ هیچ داده واقعی و هیچ تأیید عملکرد عملیاتی ارائه نمی‌کند.

## پیش‌نیاز

فایل‌های موجود زیر باید در پروژه نصب باشند:
- `Tests/LeakageFreeValidation/run.py`
- `Tests/TemporalFeatureBenchmark/run.py`

کتابخانه‌های `numpy` و `scikit-learn` در محیط مجازی نصب باشند.

## اجرای تست‌ها

```powershell
python -m unittest discover -s .\Tests\IndependentOODValidation -p 'test_*.py' -v
```

## اجرا

```powershell
python .\Tests\IndependentOODValidation\run.py `
  --db .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --out .\data\benchmark_3175\independent-ood-report-31713.json
```

خروجی قبلی را بازنویسی نمی‌کند. از فایل دیتابیس به‌صورت read-only استفاده می‌شود.

## روش

- مدل `StandardScaler + LogisticRegression` فقط روی Train زمانی Fixture V2 برازش می‌شود.
- Isotonic فقط روی Calibrator Fit برازش می‌شود.
- ویژگی تنها `log1p(duration_seconds)` است.
- آستانه `0.86177518` از گزارش Policy Selection فاز 3.1.7.12 ثابت شده است.
- هیچ داده OOD برای تنظیم مدل، کالیبراسیون، ویژگی یا آستانه استفاده نمی‌شود.
- دو تغییر توزیع از پیش تعریف‌شده ساخته می‌شوند: `overlap` (هم‌پوشانی) و `inversion` (وارونگی رابطه).
- مجموعه OOD از یک مولد مستقل ایجاد می‌شود، نه از داده عملیاتی یا از Fixture اصلی.

**توجه:** مولد OOD را خود آزمایش تعریف کرده است؛ این داده بیرونی واقعی نیست. برچسب‌ها فقط برچسب سناریو هستند. نتیجه برای ارزیابی ریسک واقعی افراد قابل استفاده نیست.
