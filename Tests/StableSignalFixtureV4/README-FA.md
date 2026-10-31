# DIDEBAN 3.1.7.18 — Stable-Signal Synthetic Fixture V4

این فاز صرفاً داده **مصنوعی** تولید می‌کند؛ هیچ داده عملیاتی یا شخصی خوانده نمی‌شود.

## هدف

در Fixture V3، سیگنال پایدار قابل‌مشاهده‌ای برای یادگیری وجود نداشت. در V4، `context_score` پیش از برچسب تولید می‌شود و رابطه `P(Y=1|context)=sigmoid(-2.1+3.5*context)` در چهار محیط ثابت است؛ ارتباط duration با برچسب در محیط‌ها تغییر می‌کند. این یک **آزمون مهندسیِ قابل‌کنترل** است، نه شاهدی از پیش‌بینی تخلف واقعی.

- توپولوژی، زمان و context با جریان‌های تصادفی جدا از برچسب تولید می‌شوند.
- A/B/C به‌ترتیب برای آموزش/کالیبراسیون/انتخاب سیاست هستند.
- D در همان SQLite است، اما برچسب‌های آن در گزارش خلاصه نمی‌شود؛ محافظت فقط پروتکلی است.
- هیچ مدل یا آستانه‌ای در این فاز انتخاب نمی‌شود.
- دیتابیس/Manifest موجود بازنویسی نمی‌شوند.

## اجرا در PowerShell

```powershell
python -m unittest discover -s .\Tests\StableSignalFixtureV4 -p 'test_*.py' -v
python .\Tests\StableSignalFixtureV4\run.py --out-dir .\data\benchmark_3175\fixture_v4_31718
```

## خروجی

- `synthetic_fixture_v4_31718.db`
- `fixture_v4_manifest_31718.json`

**مرحله بعد:** مقایسه پیش‌ثبت‌شده duration-only، context-only و ترکیبی با آموزش A، کالیبراسیون B و انتخاب سیاست C؛ بدون ارزیابی D تا زمان Freeze.
