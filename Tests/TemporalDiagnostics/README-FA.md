# DIDEBAN — فاز 3.1.7.12: Temporal Diagnostics & Distribution Shift

ابزار فقط‌خواندنی تشخیص علت افت مدل زمانی، مبتنی بر Runner واقعی فاز 3.1.7.11.

## پیش‌نیاز

پوشه‌های `Tests/TemporalFeatureBenchmark` و `Tests/LeakageFreeValidation` و پکیج‌های `numpy`, `scikit-learn`.

## اجرا از ریشه پروژه

```powershell
python -m unittest discover -s .\Tests\TemporalDiagnostics -p "test_*.py" -v

python .\Tests\TemporalDiagnostics\run.py `
  --db .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --out .\data\benchmark_3175\temporal-diagnostics-report-31712.json
```

گزارش شامل توزیع ویژگی‌ها در چهار بازه، شیفت میانگین استاندارد نسبت به Train، ضرایب استاندارد Logistic Regression، و هفت آزمایش Ablation است.

**مهم:** انتخاب ویژگی و آستانه صرفاً با Train، Calibrator Fit و Policy Selection انجام می‌شود. هیچ مدل یا آستانه‌ای بر اساس نتایج Test انتخاب نمی‌شود؛ توزیع ویژگی‌های Test صرفاً توصیفی است. کاندیدای انتخاب‌شده هنوز باید روی OOD مستقل ارزیابی شود. در داده مصنوعی Fixture V2 برچسب‌ها واقعی نیستند و گراف با استفاده از سناریوها ساخته شده است.

این بسته فایل‌های موجود و دیتابیس عملیاتی را تغییر نمی‌دهد؛ خروجی JSON موجود را بازنویسی نمی‌کند.
