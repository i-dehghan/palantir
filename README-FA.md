# DIDEBAN 3.1.6.4.3 — External Inspector Build Fix

این بسته فقط فایل کامل `palantir-dossier-studio.component.ts` را اصلاح می‌کند.

- تعریف `@Input() externalInspector = false`
- جلوگیری از نمایش Drawer داخلی وقتی Inspector خارجی فعال است
- حفظ سایر کدهای بسته 3.1.6.4.3 بدون تغییر

در ریشه پروژه استخراج کنید و سپس `cd src/frontend-angular; npx ng build` را اجرا کنید.
