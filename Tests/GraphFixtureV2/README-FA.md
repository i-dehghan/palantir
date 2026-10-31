# DIDEBAN 3.1.7.9.1 — Graph-Aware Synthetic Fixture V2

این ابزار نسخه‌ای جدید از دیتابیس مصنوعی می‌سازد و منبع را فقط در حالت read-only باز می‌کند. نام دیتابیس عملیاتی `dideban_dev.db` مسدود است. فایل خروجی باید جدید باشد.

در خروجی فقط ستون‌های source/destination حساب بانکی و caller/receiver تلفن تغییر می‌کنند. برای هر سناریوی مصنوعی، گراف‌های ستاره‌ای کوچک و مستقل ساخته می‌شوند. شناسه رکوردها، مقادیر عددی و برچسب‌های SyntheticGroundTruth تغییر نمی‌کنند. هر جزء فقط یک سناریو دارد؛ این یک **fixture آزمایشی** است، نه شبیه‌سازی واقع‌گرایانه یا OOD مستقل.

## دستورات PowerShell از ریشه پروژه

```powershell
python -m unittest discover -s .\Tests\GraphFixtureV2 -p "test_*.py" -v

python .\Tests\GraphFixtureV2\generate.py `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --report .\data\benchmark_3175\graph_fixture_v2_31791-manifest.json

python .\Tests\LeakageFreeValidation\run.py `
  --db .\data\benchmark_3175\graph_fixture_v2_31791.db `
  --out .\data\benchmark_3175\leakage-free-report-31791.json
```

اجرای آخر نیازمند Runner اصلاح‌شده فاز 3.1.7.9 است. انتخاب کالیبراتور هنوز روی داده calibration انجام می‌شود و خوش‌بینی احتمالی دارد. این ابزار به‌تنهایی آن نقص را اصلاح نمی‌کند.
