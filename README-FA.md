# DIDEBAN 3.1.5.3 — Unified Graph Filters (incremental)

این بسته تنها یک فایل کامل Angular را جایگزین می‌کند. قبل از استخراج، از فایل موجود نسخه پشتیبان تهیه کنید.

## اصلاحات
- ترکیب فیلترهای Community، Timeline Playback و Timeline Focus در یک مرحله قطعی.
- محاسبه opacity از داده تازه رندرشده، نه از وضعیت قبلاً کم‌رنگ‌شده ECharts.
- حفظ انتخاب Node Inspector و Layoutهای فعلی.

## نصب
از ریشه پروژه ZIP را استخراج کنید؛ سپس:
`cd src/frontend-angular && npx ng build`

## تست دستی
1. انتخاب Community و Timeline و بازگشت به «همه».
2. تغییر Layout هنگام Highlight رویداد Timeline.
3. انتخاب Inspect پرونده دیگر و تأیید حذف Highlight قبلی.
4. کلیک روی چند گره و تأیید تغییر Node Inspector.

## محدوده
این یک پچ اصلاح همگام‌سازی فیلترهاست، نه بازطراحی Sidebar و نه افزودن Centrality API.
Build در این محیط اجرا نشده است؛ تست مرورگر و Build باید در محیط پروژه انجام شود.
