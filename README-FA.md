# DIDEBAN Phase 3.1.7.5 — Isolated staging / preflight

این بسته فقط کپی ایزوله ایجاد می‌کند و Backend را اجرا نمی‌کند. هیچ فایل موجود پروژه را بازنویسی نمی‌کند.

```powershell
cd D:\project\Dideban
python -m unittest discover -s .\Tests\IsolatedBackendBenchmark -v
python .\Tests\IsolatedBackendBenchmark\prepare.py --db .\data\dideban_synthetic_3173.db --out-dir .\data\benchmark_3175
```

## نکات اتصال Backend

Program.cs اتصال عملیاتی را از `ConnectionStrings:DefaultConnection` می‌خواند، ولی Identity از `Identity:DatabasePath` و Security Audit از `SecurityAudit:DatabasePath` استفاده می‌کنند. قبل از راه‌اندازی هر میزبان آزمایشی، هر سه مسیر باید به فایل‌های داخل `data\benchmark_3175` اشاره کنند. تغییر تنها DefaultConnection ایزوله‌سازی کامل نیست. `EnsureCreated()` و `IdentityPermissionSeeder` هنگام شروع اجرا می‌شوند. `ReconciliationService` ابتدا تمام `DiscrepancyLogs` دیتابیس انتخاب‌شده را حذف می‌کند.

در این بسته اجرای HTTP endpoint عمداً خودکار نشده است: نیاز به تأیید نسخه سرویس‌ها، هویت و مجوز `AuditExecute` دارد. پس از Preflight، برای اجرای Baseline، جداگانه راه‌انداز امن .NET و خروجی کلیددار طراحی خواهد شد. وضعیت `STAGED_NOT_EVALUATED` به معنای PASS موتور نیست.

اطلاعات حساس appsettings را در گزارش یا ZIP منتشر نکنید؛ کلیدها و گذرواژه‌های قبلاً به‌اشتراک‌گذاشته‌شده را تعویض کنید.
