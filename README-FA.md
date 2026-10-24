# DIDEBAN 3.1.2 — Community Detection (local moving)

این بسته افزایشی است و هیچ فایل موجود پروژه را جایگزین نمی‌کند. مبنا: مدل Ontology در `palantir-develop (4).zip` و API فاز 3.1.1.

## نصب و اجرا
در ریشه `D:\project\Dideban` استخراج کنید، سپس:

```powershell
cd D:\project\Dideban\src\backend-dotnet\Dideban.Api
dotnet build
cd D:\project\Dideban\Tests\CommunityDetectionTests
dotnet run
```

## نحوه اتصال به جریان فعلی
بعد از `GraphAnalyticsEngine.ComputeCentralityAndRisk(graph)` در یک نقطه کنترل‌شده از سرویس Traversal، می‌توان `GraphCommunityDetectionEngine.Analyze(graph)` را فراخوانی کرد. **این بسته به‌صورت خودکار Traversal یا API را تغییر نمی‌دهد** تا تغییر قراردادهای عملیاتی نیازمند تست یکپارچگی باشد. متد `Analyze` روی Properties گره‌ها کلیدهای `CommunityId`، `CommunitySize`، `CrossCommunityDegree` و `CommunityDetectionVersion` می‌نویسد و نتیجه ساختاریافته برمی‌گرداند.

## قرارداد الگوریتم
- نسخه **تک‌سطحی local moving با هدف بیشینه‌سازی Modularity وزن‌دار** است، نه Louvain چندسطحی کامل یا Leiden.
- جهت یال‌ها در خوشه‌بندی کنار گذاشته می‌شود و وزن روابط متقابل/موازی جمع می‌شود؛ وزن نشان‌دهنده قدرت ارتباط است نه فاصله.
- خودحلقه‌ها، وزن غیرمثبت/نامعتبر و یال‌های ناموجود نادیده گرفته می‌شوند.
- گره بدون یال خوشه مستقل دارد؛ شناسه خوشه بر اساس ترتیب واژگانی کوچک‌ترین شناسه عضو پایدار است.
- `BridgeNodeIds` صرفاً گره‌های دارای حداقل یک یال میان‌خوشه‌ای هستند؛ معادل Betweenness یا کشف تخلف نیستند.
- الگوریتم فعلی برای گراف‌های کوچک/متوسط مناسب است؛ محاسبه مجدد کامل Modularity برای هر جابه‌جایی، برای گراف بزرگ بهینه نیست.
- `RiskScore` تغییر نمی‌کند؛ نتیجه فقط بیانگر ساختار شبکه است.

## اعتبارسنجی
تست‌های مستقل در بسته قرار دارند؛ این محیط SDK دات‌نت ندارد و Build/Run اینجا اجرا نشده است.
