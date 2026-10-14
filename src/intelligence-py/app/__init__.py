"""
DIDEBAN Intelligence Core Package
"""
__version__ = "2.1.0"

# اکسپورت سرویس‌ها جهت جلوگیری از خطای ایمپورت در پروسه‌های فرزند
from .services.forensic_narrative import forensic_narrative_engine
from .services.matcher import matcher_engine

__all__ = ["forensic_narrative_engine", "matcher_engine"]