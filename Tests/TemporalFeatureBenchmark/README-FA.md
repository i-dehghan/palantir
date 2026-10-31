# فاز 3.1.7.11 — Temporal Feature Engineering & Validation

این Benchmark تنها حوزه TELECOM را بررسی می‌کند و به فایل `Tests/LeakageFreeValidation/run.py` وابسته است. فایل‌های قبلی را تغییر نمی‌دهد.

- چهار بازه زمانی متوالی برای Train / Calibrator Fit / Policy Selection / Test، بدون تقسیم رکوردهای دارای زمان برابر.
- ویژگی‌های ۱، ۷ و ۳۰ روزه فراوانی تماس، تماس تکراری با مخاطب، تنوع مخاطب و میانگین مدت تماس گذشته.
- ویژگی‌های تاریخی فقط با رخدادهای **پیش از زمان رکورد** ساخته می‌شوند؛ تماس‌های هم‌زمان به یکدیگر دسترسی ندارند.
- مقایسه مدل `log_duration` تنها و مدل ویژگی‌های زمانی، با Logistic Regression و انتخاب کالیبراسیون و آستانه روی Policy Selection.
- هم‌پوشانی endpointها بین بازه‌های زمانی گزارش می‌شود؛ **این پروتکل ادعای component-disjoint بودن ندارد.**

## نصب

ZIP را در ریشه `D:\project\Dideban` استخراج کنید. فایل‌های این بسته فقط در `Tests/TemporalFeatureBenchmark/` قرار می‌گیرند.

## تست

```powershell
python -m unittest discover -s .\Tests\TemporalFeatureBenchmark -p 'test_*.py' -v
```

## اجرا

```powershell
python .\Tests\TemporalFeatureBenchmark\run.py `
  --db .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --out .\data\benchmark_3175\temporal-feature-report-31711.json
```

**مهم:** داده مصنوعی ممکن است تاریخ‌هایی داشته باشد که برچسب‌های مثبت و منفی در چهار بازه زمانی متوازن نباشند؛ در این صورت برنامه خطا می‌دهد و به تقسیم تصادفی نشت‌دار برنمی‌گردد. گزارش فقط برای آزمون مصنوعی است؛ برای ادغام در سیستم عملیاتی کافی نیست.

برای OOD مستقل باید یک دیتاست دیگر با سازوکار زمانی و شبکه‌ای متفاوت تولید و ارزیابی شود. این بسته چنین دیتاستی تولید نمی‌کند.
