# فاز 3.1.7.5 — اجرای Baseline ایزوله

این Runner سورس‌های فعلی سرویس و DbContext را با `Compile Include` به پروژه مستقل وصل می‌کند؛ پروژه اصلی را Reference یا Build نمی‌کند، بنابراین Target مربوط به `taskkill` اجرا نمی‌شود.

**مهم:** اجرای Reconciliation جدول `DiscrepancyLogs` را در کپی آزمایشی حذف و بازنویسی می‌کند. فقط روی کپی آماده‌شده اجرا کنید.

از ریشه `D:\project\Dideban`:

```powershell
dotnet run --project .\Tests\BackendBaselineRunner\BackendBaselineRunner.csproj -- `
  --db .\data\benchmark_3175\operational_benchmark.db `
  --out .\data\benchmark_3175\baseline-report.json
```

قبل از اجرا اطمینان حاصل کنید `operational_benchmark.db` فقط کپی آزمایشی است. اگر قبلاً اجرا شده، یک کپی جدید با `prepare.py` در مسیر جدید تهیه کنید و برای آن مسیر جدید، در Runner شرط نام پوشه را مطابق سیاست ایزوله‌سازی بازبینی کنید.

گزارش شامل توزیع واقعی امتیازهای Backend است. تطبیق شناسه با Ground Truth در این نسخه هنوز انجام نشده است.


Logging compile fix: GlobalUsings.cs supplies ILogger<T> to linked service source.
