# فاز 3.1.7.8 — OOD مصنوعی مستقل و تشخیص نشت گراف

این بسته فایل‌های قبلی را بازنویسی نمی‌کند و دیتابیس SQLite را فقط در حالت خواندنی باز می‌کند.

از ریشه پروژه:

```powershell
python -m unittest discover -s .\Tests\IndependentValidation -p "test_*.py" -v

python .\Tests\IndependentValidation\run.py `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\independent-validation-report-3178.json
```

پیش‌نیاز: نصب `numpy` و `scikit-learn` و وجود `Tests/RegressionBenchmark/run.py` از مرحله 3.1.7.6.

این آزمون مدل را با تمام داده‌های اصلی آموزش می‌دهد و روی یک مجموعه مصنوعی مستقل با توزیع‌های جابه‌جاشده و هم‌پوشان ارزیابی می‌کند. این آزمون، اعتبارسنجی داده واقعی نیست. برچسب‌ها بر اساس طراحی مولد دوم ساخته شده‌اند.

هم‌پوشانی endpointها و اندازه اجزای متصل گراف در تقسیم گروهی مبتنی بر شناسه ملی گزارش می‌شود. **Graph component split در این نسخه اجرا نشده است.** وجود هم‌پوشانی باید قبل از ادغام عملیاتی بررسی شود.

خروجی قبلی را حذف نکنید؛ گزارش جدید باید مسیر جدید داشته باشد.
