# DIDEBAN — فاز 3.1.7.15 — Multi-Environment Synthetic Fixture V3

این بسته **فقط داده مصنوعی آزمایشگاهی** تولید می‌کند؛ هیچ مدلی را آموزش نمی‌دهد و به دیتابیس عملیاتی یا سرویس‌های .NET/Angular دست نمی‌زند.

## مسیر فایل‌ها

- `Tests/MultiEnvironmentFixtureV3/run.py`
- `Tests/MultiEnvironmentFixtureV3/test_run.py`
- `Tests/MultiEnvironmentFixtureV3/README-FA.md`

## اجرا در PowerShell

```powershell
cd D:\project\Dideban
python -m unittest discover -s .\Tests\MultiEnvironmentFixtureV3 -p "test_*.py" -v
python .\Tests\MultiEnvironmentFixtureV3\run.py --out-dir .\data\benchmark_3175\fixture_v3_31715
```

برای اجرای مجدد از مسیر خروجی **جدید** استفاده کنید؛ بازنویسی فایل موجود عمداً ممنوع است.

## قرارداد آزمایش

- A: Train؛ B: Calibration؛ C: Policy Selection؛ D: Final Evaluation **sealed**.
- گراف و رویدادهای تماس با RNG مستقل، قبل از تولید برچسب‌ها ساخته می‌شوند.
- تماس‌های تکراری عمداً تولید می‌شوند و فاصله زمانی رویدادها ۶ ساعت برای هر دسته پنج‌تایی است.
- توزیع مدت تماس بین محیط‌ها تغییر می‌کند. برچسب‌ها مصنوعی‌اند و معرف رفتار واقعی اشخاص نیستند.
- برای محیط D هیچ انتخاب ویژگی، آستانه یا تنظیم مدل انجام نشود؛ صرفاً یک بار بعد از تثبیت مشخصات آزمایش ارزیابی شود.
- Manifest حاوی SHA-256 فایل SQLite است؛ برای کنترل تغییرات پیش از مرحله نهایی، هش را دوباره محاسبه کنید.
- «sealed» در اینجا **قرارداد فرایندی** است، نه کنترل دسترسی رمزنگاری‌شده.

## محدودیت

مولد سناریوهای ساده و مستقل دارد؛ ساختار گراف نماینده شبکه واقعی نیست. تولید توپولوژی مستقل از برچسب از نشت برچسب در ساخت گراف جلوگیری می‌کند، ولی به‌تنهایی کفایت علمی مدل را اثبات نمی‌کند.
