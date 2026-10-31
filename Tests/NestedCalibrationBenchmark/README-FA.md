# DIDEBAN — فاز 3.1.7.10

**Nested Calibration & TELECOM Feature Ablation** — آزمایش مستقل، فقط‌خواندنی و مخصوص دیتاست مصنوعی.

این بسته به فایل موجود `Tests/LeakageFreeValidation/run.py` از فاز 3.1.7.9 وابسته است و آن را تغییر نمی‌دهد.

چهار بخش مستقل بر اساس شناسه واردکننده یا Connected Components گراف:

- `train`: آموزش Logistic Regression، حدود ۶۰٪
- `calibratorFit`: برازش Sigmoid و Isotonic، حدود ۱۰٪
- `policySelection`: انتخاب روش کالیبراسیون با Brier و آستانه با Precision حداقل ۰٫۸، حدود ۱۰٪
- `test`: ارزیابی نهایی، حدود ۲۰٪

نسبت‌ها ممکن است به دلیل اندازه اجزای گراف کمی تغییر کنند. هیچ fallback نشت‌دار وجود ندارد. برای TELECOM مدل کامل و شش ablation (حذف هر ویژگی یا استفاده از فقط یک ویژگی) ارزیابی می‌شوند؛ **از خروجی Test برای انتخاب ویژگی استفاده نکنید**.

## نصب و اجرا از ریشه پروژه

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\dideban-phase3-1-7-10-nested-calibration.zip" -DestinationPath D:\project\Dideban -Force

python -m unittest discover -s .\Tests\NestedCalibrationBenchmark -p "test_*.py" -v

python .\Tests\NestedCalibrationBenchmark\run.py `
  --db .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --out .\data\benchmark_3175\nested-calibration-report-31710.json
```

خروجی باید نامی جدید داشته باشد؛ فایل موجود بازنویسی نمی‌شود. ورودی SQLite فقط‌خواندنی است.

**محدودیت‌ها:** داده‌ها مصنوعی هستند، ساختار گراف V2 با برچسب سناریو ساخته شده، و ویژگی درجه گراف در هر بخش با تمام رکوردهای همان بخش محاسبه می‌شود. این ارزیابی اعتبار عملیاتی یا causal/online ندارد. نتایج ablation برای تشخیص‌اند، نه انتخاب ویژگی روی Test.
