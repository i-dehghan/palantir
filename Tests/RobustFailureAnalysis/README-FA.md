# DIDEBAN 3.1.7.14 — Robust Failure Analysis

این ابزار **فقط گزارش‌های تجمیعی مصنوعی** فازهای 3.1.7.11، 3.1.7.12 و 3.1.7.13 را می‌خواند. به دیتابیس، اطلاعات فردی، Backend و مدل عملیاتی دسترسی ندارد. هیچ آموزش مجدد، انتخاب آستانه یا استفاده از OOD برای بهینه‌سازی انجام نمی‌دهد.

## فایل‌های جدید

- `Tests/RobustFailureAnalysis/run.py`
- `Tests/RobustFailureAnalysis/test_run.py`
- `Tests/RobustFailureAnalysis/README-FA.md`

## نصب

ZIP را در ریشه `D:\project\Dideban` استخراج کنید. فایل‌های موجود را بازنویسی نکنید.

## تست

```powershell
cd D:\project\Dideban
python -m unittest discover -s .\Tests\RobustFailureAnalysis -p "test_*.py" -v
```

تست یکپارچگی در صورت نبود گزارش‌های محلی به‌صورت واضح Skip می‌شود؛ چهار تست دیگر مستقل از گزارش‌ها هستند.

## اجرا

```powershell
python .\Tests\RobustFailureAnalysis\run.py `
  --temporal .\data\benchmark_3175\temporal-feature-report-31711.json `
  --diagnostics .\data\benchmark_3175\temporal-diagnostics-report-31712.json `
  --ood .\data\benchmark_3175\independent-ood-report-31713.json `
  --out .\data\benchmark_3175\robust-failure-report-31714.json
```

در صورت وجود فایل خروجی، ابزار عمداً آن را بازنویسی نمی‌کند؛ برای اجرای مجدد مسیر خروجی جدید انتخاب کنید. هر سه گزارش باید `readOnly=true` و شناسه فاز صحیح داشته باشند.

## تفسیر

- `deltaVsTemporalTest`: تغییر معیارها نسبت به آزمون زمانی فاز 3.1.7.11؛ **به علت تفاوت محیط‌ها، تخمین اثر علّی نیست**.
- `allZeroFeaturesBySummary`: ستون‌هایی که نرخ صفر آن‌ها در تمام چهار بخش ۱۰۰٪ گزارش شده است.
- `identicalDistributionSummariesNotProvenRowDuplicates`: ستون‌هایی با آمار خلاصه یکسان؛ **برابری سطری اثبات نشده است**.
- `largeTestVsTrainStandardizedMeanShifts`: اختلاف میانگین استانداردشده حداقل ۰٫۵؛ آزمون معناداری آماری نیست.
- `decision`: وضعیت عدم استقرار و طرح پیشنهادی یک Fixture جدید، با پیش‌ثبت سناریوها و Test دست‌نخورده.

**محدودیت:** مولد OOD در فاز 3.1.7.13 مستقل از آموزش اما همچنان طراحی‌شده و مصنوعی است؛ برچسب‌ها بیانگر تخلف واقعی نیستند. این ابزار هیچ‌گونه نتیجه‌ای درباره اشخاص ارائه نمی‌کند.
