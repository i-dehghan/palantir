# DIDEBAN 3.1.6.3.1 — API Contract Smoke/Integration Tests

این بسته فقط یک تست HTTP مبتنی بر PowerShell اضافه می‌کند؛ فایل‌های موجود Backend و Angular تغییر نمی‌کنند.

## پیش‌نیاز

- Backend با پچ 3.1.6.3 در حال اجرا باشد.
- توکن JWT معتبر با مجوز `AuditRead` در اختیار داشته باشید.
- تست‌ها روی محیط توسعه/آزمایش اجرا شوند، نه Production.

## اجرا

```powershell
cd D:\project\Dideban
$token = Read-Host 'JWT with AuditRead'
.\Tests\GraphRiskApiContractTests\Run-GraphRiskApiContractTests.ps1 -BaseUrl 'https://localhost:7001' -BearerToken $token
```

پورت را مطابق آدرس واقعی Backend تغییر دهید. در صورت بروز خطای گواهی توسعه، گواهی ASP.NET Core را با `dotnet dev-certs https --trust` تنظیم کنید؛ اعتبارسنجی TLS را غیرفعال نکنید.

این تست قرارداد واقعی HTTP شامل پاسخ معتبر، وجود baseline/propagation، نسخه‌ها، تکرارپذیری، کنترل شناسه تکراری، یال معلق، وزن نامعتبر، امتیاز خارج از محدوده، تنظیمات و محدودیت تعداد گره را بررسی می‌کند.

**محدودیت:** این بسته به‌تنهایی مجوزهای 401/403 را با هویت‌های جداگانه، سقف 2MB یا یکپارچگی کل زنجیره در برابر یال تکراری تست نمی‌کند. برای آن‌ها تست‌های مستقل با هویت آزمایشی و fixture تخصصی لازم است.
