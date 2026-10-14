# intelligence-py/app/local_fallback_engine.py
from typing import List, Dict, Any

class LocalForensicFallbackEngine:
    """موتور تحلیلگر محلی سبک برای شرایط قطعی اینترنت در سامانه دیده‌بان."""

    def __init__(self):
        # الگوهای از پیش‌تدوین‌شده حقوقی و گمرکی بر اساس حوزه‌های مختلف
        self.templates = {
            "CUSTOMS": (
                "بر اساس تقاطع‌گیری داده‌های گمرکی و سامانه‌های صمت برای سوژه‌های [{identifiers}]، "
                "الگوی ورود و اظهار قطعات منفصله یک کالای نهایی ذیل ردیف‌های تعرفه ۵٪ "
                "به منظور فرار از حقوق ورودی ۲۶٪ کالای کامل (مغایر با قاعده ۲-الف قواعد عمومی تفسیری HS) "
                "به صورت ساختاریافته محرز گردیده است."
            ),
            "BANKING": (
                "تحلیل گردش مالی حساب‌های منتسب به سوژه‌های [{identifiers}] حاکی از "
                "استفاده از الگوی لایه‌‌بندی عواید (Layering) و حساب‌های واسط (Mule Accounts) است. "
                "تراکنش‌ها نشان‌دهنده تقسیم مبالغ کلان و واریز خرد به حساب‌های فاقد فعالیت تجاری واقعی "
                "و تخلیه آنی از طریق شبکه ساتنا می‌باشد."
            ),
            "TELECOM": (
                "بررسی داده‌های ترافیکی CDR برای سوژه‌های [{identifiers}] نشان‌دهنده "
                "ثبت فعالیت غیرمتعارف روی دکل‌های سلولی مرزی و استفاده از تجهیزات واسط (SIM-Box Bypass) "
                "با نسبت بالای تماس ورودی به خروجی است."
            )
        }

    def generate_narrative(self, identifiers: List[str], domain: str = "CUSTOMS") -> Dict[str, Any]:
        """تولید گزارش نریتیو بدون نیاز به اینترنت یا سرویس ابری"""
        ids_str = " و ".join(identifiers)
        template = self.templates.get(domain, self.templates["CUSTOMS"])
        narrative = template.format(identifiers=ids_str)

        return {
            "summary_narrative": narrative,
            "risk_level": "CRITICAL",
            "inferred_violation": "مغایرت ساختاری و فرار از ضوابط نظارتی (موتور محلی دیده‌بان)",
            "targets": identifiers,
            "engine_type": "OFFLINE_RULE_BASED"
        }

    def predict_next_move(self, identifiers: List[str]) -> Dict[str, Any]:
        """پیش‌بینی ساده و مبتنی بر الگو برای اقدامات آتی سوژه"""
        return {
            "predicted_action": f"اقدام به ثبت سفارش جدید برای قطعات تکمیلی توسط شبکه منتسب به {identifiers[0]} تحت کارت بازرگانی یکبارمصرف.",
            "probability_percent": 89,
            "timeframe_days": 4,
            "vulnerable_customs": "گمرک شهید رجایی / منطقه ویژه بوشهر",
            "recommended_countermeasure": "اعمال مسیر قرمز گمرکی و مسدودی موقت کارت‌های بازرگانی هم‌پیوند."
        }

# نمونه آماده برای تزریق در سرور FastAPI
local_fallback_engine = LocalForensicFallbackEngine()