# DIDEBAN 3.1.7.6 — Experimental Regression Benchmark

موتور مستقل و صرفاً خواندنی؛ هیچ فایل Backend یا دیتابیس عملیاتی را تغییر نمی‌دهد.

از ریشه پروژه:

```powershell
python -m pip install -r .\Tests\RegressionBenchmark\requirements.txt
python -m unittest discover -s .\Tests\RegressionBenchmark -p "test_*.py" -v
python .\Tests\RegressionBenchmark\run.py `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\regression-report-3176.json
```

مدل Logistic Regression برای هر حوزه جداگانه آموزش می‌بیند. Split طبقه‌بندی‌شده 70/30 و StandardScaler فقط روی بخش آموزش Fit می‌شوند. `FeaturesJson`، شناسه‌ها، ترتیب ردیف‌ها و برچسب سناریو وارد X نمی‌شوند.

**محدودیت‌های مهم:** برچسب‌ها مصنوعی و مبتنی بر ویژگی‌های تولیدشده هستند؛ نتایج بالا به معنی اعتبار واقعی نیست. درجه حساب/شماره روی تمام گراف بدون برچسب محاسبه می‌شود (transductive). Split تصادفی، ارزیابی زمانی یا تفکیک کامل موجودیت‌ها نیست. امتیاز خروجی نباید به عنوان احتمال وقوع جرم استفاده شود. هیچ ادغام خودکار با Backend انجام نمی‌شود.
