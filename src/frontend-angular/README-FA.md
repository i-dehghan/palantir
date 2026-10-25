# DIDEBAN — Phase 3.1.6.4.1: Graph Risk API Angular Adapter

این بسته فقط یک فایل **جدید** اضافه می‌کند و هیچ فایل موجودی را جایگزین نمی‌کند:

`src/frontend-angular/src/app/core/services/graph-risk.service.ts`

## قرارداد

- `GraphRiskService.analyze(graph, settings?)` یک `Observable<GraphRiskAnalysisResponse>` برمی‌گرداند.
- `baseline` شامل `priorityScore` و عوامل توضیحی است.
- `propagation` شامل `baseScore`, `networkInfluence`, `combinedIndex` و `sources` است.
- تنظیمات اختیاری با نام‌های `maxHops`, `decay`, `influenceCap` ارسال می‌شوند.
- آدرس API مطابق سرویس‌های فعلی پروژه: `http://localhost:5191`.
- سرویس وضعیت گراف را تغییر نمی‌دهد و هیچ درخواست خودکاری ایجاد نمی‌کند.

## نصب

فایل ZIP را در ریشه `D:\project\Dideban` استخراج کنید.

## اعتبارسنجی

```powershell
cd D:\project\Dideban\src\frontend-angular
npm ci
npx ng build
```

این بسته تنها زیرفاز 3.1.6.4.1 است. اتصال به Sidebar و Heatmap در مراحل بعدی و پس از بررسی آخرین فایل‌های UI انجام می‌شود.
