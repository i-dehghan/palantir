# DIDEBAN 3.1.7.6 — Ground Truth Evaluation

ابزار فقط خواندنی است و خروجی واقعی `DiscrepancyLogs` را به شناسه‌های `SyntheticGroundTruth` متصل می‌کند.

- CUSTOMS: `OrderRegNumber` → `RecordId`
- BANKING: حذف پیشوند `BANK-TX-`
- TELECOM: حذف پیشوند `TEL-CALL-`

**تعریف صریح آزمایش:** `high` و `network` مثبت، `normal` و `moderate` منفی‌اند. این تعریف صرفاً برای سنجش سناریوهای مصنوعی است، نه قضاوت درباره جرم.

از ریشه پروژه اجرا کنید:

```powershell
python -m unittest discover -s .\Tests\GroundTruthEvaluation -p "test_*.py" -v

python .\Tests\GroundTruthEvaluation\evaluate.py `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\groundtruth-report-3176.json
```

اگر شناسه‌ها در نسخه فعلی مولد با این قراردادها متفاوت باشند، خروجی `unknownLogRows` نشان می‌دهد و نباید Precision/Recall را بدون بررسی نگاشت تفسیر کرد.

محدودیت: سرویس فعلی فقط ۷۰۰ ورودی هر حوزه را بدون ORDER BY می‌خواند؛ Precision/Recall مربوط به شناسایی سناریوهای مصنوعی در کل دیتاست است، نه ارزیابی رتبه‌بندی همه رکوردها. برای بازطراحی مدل، ابتدا باید نگاشت و معیارهای این گزارش تأیید شوند.
