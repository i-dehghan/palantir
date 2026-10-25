# DIDEBAN — Phase 3.1.5 (incremental UI patch)

این بسته فقط کامپوننت موجود Palantir Dossier Studio را جایگزین می‌کند.

- کاهش ازدحام برچسب در گراف‌های بیش از ۱۸ گره؛ برچسب با hover دیده می‌شود.
- بازکردن Node Inspector با کلیک روی گره و انتشار رویداد موجود nodeSelected.
- نمایش Community ID و درجه ارتباطی محاسبه‌شده در نمای فعلی.
- نمایش PageRank و Betweenness فقط اگر داده واقعی روی گره موجود باشد؛ عدد ساختگی تولید نمی‌شود.
- حفظ layoutهای فعلی و تمرکز Timeline پس از render.

محدودیت: فیلتر ترکیبی Timeline و Community هنوز نیازمند بازطراحی state pipeline است؛ این بسته ادعای حل آن را ندارد.

## نصب
در ریشه پروژه استخراج کنید؛ از فایل قبلی پشتیبان بگیرید.

## بررسی
`cd src/frontend-angular; npx ng build`
سپس کلیک روی گره، بازشدن Inspector، hover روی گره‌های گراف متراکم، تغییر layout و انتخاب Timeline را بررسی کنید.
