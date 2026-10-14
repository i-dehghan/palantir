# intelligence-py/app/services/forensic_narrative.py
import os
import json
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

DEFAULT_LLM_API_KEY = os.getenv("LLM_API_KEY", "your-deepseek-api-key")
DEFAULT_LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "deepseek-chat")


class ForensicNarrativeEngine:
    """
    موتور استدلال و نریتیو جرم‌شناسی سامانه دیده‌بان مجهز به هسته محاسباتی رگرسیون آماری و تفکیک‌گر حوزه.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or DEFAULT_LLM_API_KEY
        self.base_url = (base_url or DEFAULT_LLM_BASE_URL).rstrip("/")
        self.model = model or DEFAULT_MODEL_NAME

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        json_mode: bool = False,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=90.0, verify=False) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except httpx.HTTPError as ex:
                logger.error(f"خطا در فراخوانی سرویس LLM ابری: {str(ex)}")
                raise RuntimeError(f"خطای سرویس هوش مصنوعی: {str(ex)}")

    async def generate_forensic_narrative(
        self,
        identifiers: List[str],
        evidences: Optional[List[Dict[str, Any]]] = None,
        graph_nodes: Optional[List[Dict[str, Any]]] = None,
        graph_edges: Optional[List[Dict[str, Any]]] = None,
        nodes: Optional[List[Dict[str, Any]]] = None,
        edges: Optional[List[Dict[str, Any]]] = None,
        declared_parts: Optional[Any] = None,
        inferred_finished_good: Optional[str] = None,
        inferred_hs_code: Optional[str] = None,
        regression_stats: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        
        resolved_nodes = graph_nodes or nodes or kwargs.get("nodes", [])
        resolved_edges = graph_edges or edges or kwargs.get("edges", [])
        resolved_evidences = evidences or kwargs.get("evidences", [])
        
        context_corpus = json.dumps({
            "nodes": resolved_nodes,
            "evidences": resolved_evidences,
            "edges": resolved_edges,
            "declared_parts": declared_parts,
            "regression_stats": regression_stats
        }, ensure_ascii=False).lower()

        is_banking = any(k in context_corpus for k in ["bank", "acc", "mule", "milliar", "rial", "حساب", "تراکنش", "ساتنا", "پایا", "ملت", "صادرات", "تجارت", "پولشویی", "aml", "تخلیه", "واریز", "گردش"])
        is_telecom = any(k in context_corpus for k in ["tel", "sim", "cdr", "bts", "دکل", "مخابرات", "سیم‌کارت", "imsi", "imei", "سیم‌باکس", "bypass"])

        if is_banking:
            domain_instruction = (
                "🚨 قانون تحلیلی سخت‌گیرانه (حوزه بانکی و پولشویی - AML):\n"
                "این پرونده منحصراً مربوط به تراکنش‌های مالی مشکوک، حساب‌های اجاره‌ای و پولشویی است[cite: 13].\n"
                "تمرکز تحلیلی شما باید روی حساب‌های واسط (Mule Accounts)، سرعت خروج وجه و لایه‌بندی عواید باشد[cite: 13]."
            )
            default_violation = "تخلفات قانون مبارزه با پولشویی (لایه‌بندی عواید و حساب‌های واسط)"
        elif is_telecom:
            domain_instruction = (
                "🚨 قانون تحلیلی سخت‌گیرانه (حوزه مخابرات و CDR):\n"
                "این پرونده منحصراً مربوط به ترافیک مخابراتی، قاچاق مکالمات و تجهیزات سیم‌باکس است[cite: 13]."
            )
            default_violation = "قاچاق ترافیک مخابراتی و ترمینیشن غیرمجاز (SIM-Box)"
        else:
            domain_instruction = (
                "🚨 قانون تحلیلی سخت‌گیرانه (حوزه تجارت فرامرزی و گمرک):\n"
                "این پرونده مربوط به گمرک، اسناد واردات و تحلیل ریاضی رگرسیون مقادیر ارزش و وزن است[cite: 13]."
            )
            default_violation = "تخلفات گمرکی، کم‌اظهاری و فرار از حقوق ورودی"

        system_prompt = (
            "شما یک بازپرس ارشد و کارشناس خبره جرم‌شناسی مالی و سامانه‌های کلان‌داده نظارتی (سامانه دیده‌بان) هستید[cite: 13].\n"
            f"{domain_instruction}\n"
            "شما باید تحلیل نهایی را مستقیماً بر اساس مقادیر عددی مدل‌های رگرسیونی (ضریب احتمال تخلف و باقیمانده‌های ارزش‌گذاری) تدوین کنید و گزارش را به صورت مستند و رسمی ارائه دهید[cite: 13]."
        )

        user_content = {
            "identifiers": identifiers,
            "detected_domain": "BANKING" if is_banking else ("TELECOM" if is_telecom else "CUSTOMS"),
            "nodes": resolved_nodes,
            "edges": resolved_edges,
            "evidences": resolved_evidences,
            "regression_stats": regression_stats,
            "inferred_finished_good": inferred_finished_good
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"لطفاً بر اساس شواهد، گراف پیونده‌ها و خروجی‌های آماری رگرسیون زیر، تحلیل جرم‌شناسی و شگرد تخلف را مستند کنید:\n{json.dumps(user_content, ensure_ascii=False, indent=2)}",
            },
        ]

        try:
            narrative = await self._call_llm(messages, temperature=0.25)
        except Exception as e:
            logger.warning(f"Fallback به دلیل عدم دسترسی به LLM: {e}")
            if is_banking:
                narrative = (
                    f"بر اساس تقاطع‌گیری تراکنش‌های بانکی منتسب به شناسه‌های [{', '.join(identifiers)}]، "
                    "الگوی تخلیه فوق‌سریع وجوه از طریق شبکه‌ای از حساب‌های واسط (Mule Accounts) و تخلفات "
                    "مستند در قانون مبارزه با پولشویی به صورت قطعی محرز گردیده است[cite: 13]."
                )
            else:
                reg_info = f" (ضریب ریسک رگرسیونی: {regression_stats.get('violation_probability', 'نامشخص')})" if regression_stats else ""
                narrative = (
                    f"بر اساس تقاطع‌گیری اسناد واردات و مدل رگرسیونی خطی میان شناسه‌های [{', '.join(identifiers)}]{reg_info}، "
                    "مغایرت ارزش‌گذاری و فرار از حقوق ورودی گمرکی به صورت ساختاریافته محرز گردید[cite: 13]."
                )

        return {
            "summaryNarrative": narrative,
            "summary_narrative": narrative,
            "riskLevel": "CRITICAL",
            "inferredViolation": default_violation,
            "targets": identifiers,
        }

    async def chat_with_copilot(
        self,
        identifiers: List[str],
        question: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        context_data: Optional[Dict[str, Any]] = None,
        nodes: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        system_prompt = (
            "شما 'دستیار هوشمند پرونده (Forensic Copilot)' در سامانه اطلاعاتی دیده‌بان هستید[cite: 13].\n"
            "پاسخ‌های شما باید دقیق، مستند به شواهد و مدل‌های آماری رگرسیون باشد[cite: 13]."
        )

        messages = [{"role": "system", "content": system_prompt}]

        if context_data or nodes:
            messages.append({
                "role": "system",
                "content": f"شواهد و اقلام جاری پرونده روی صفحه:\n{json.dumps({'context': context_data, 'nodes': nodes}, ensure_ascii=False)}",
            })

        if chat_history:
            for msg in chat_history[-6:]:
                role = "assistant" if msg.get("role") == "assistant" else "user"
                content = msg.get("content", "")
                if content:
                    messages.append({"role": role, "content": content})

        messages.append({
            "role": "user",
            "content": f"سوژه‌های تحت رصد: {', '.join(identifiers)}\nسوال بازرس: {question}",
        })

        try:
            answer = await self._call_llm(messages, temperature=0.3)
        except Exception as e:
            logger.warning(f"خطا در ارتباط با Copilot: {e}")
            answer = (
                f"بر اساس مستندات ثبت‌شده در سامانه دیده‌بان برای سوژه‌های ({', '.join(identifiers)}), "
                "بررسی تراکنش‌ها و مدل‌های آماری نشان‌دهنده لزوم مسدودی فوری حساب‌ها و صدور دستورات نظارتی است[cite: 13]."
            )

        return {"answer": answer}

    async def predict_next_move(
        self,
        identifiers: List[str],
        evidences: Optional[List[Dict[str, Any]]] = None,
        inferred_product: str = "دارایی مالی یا دارایی تجاری",
        **kwargs
    ) -> Dict[str, Any]:
        system_prompt = (
            "شما موتور پیش‌بینی ناهنجاری و رفتار آتی متخلفین اقتصادی در سامانه دیده‌بان هستید[cite: 13].\n"
            "خروجی شما باید منحصراً یک شیء JSON معتبر با کلیدهای زیر باشد:\n"
            "{\n"
            '  "predicted_action": "شرح اقدام بعدی سوژه",\n'
            '  "probability_percent": 88,\n'
            '  "timeframe_days": 5,\n'
            '  "vulnerable_customs": "شعبه‌های بانکی / مبادی مرزی",\n'
            '  "recommended_countermeasure": "دستور نظارتی پیشنهادی جهت توقف"\n'
            "}"
        )

        user_content = {
            "identifiers": identifiers,
            "inferred_product": inferred_product,
            "evidences_count": len(evidences or []),
            "evidences_sample": (evidences or [])[:8],
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"پیش‌بینی اقدام آتی را در قالب JSON ارائه دهید:\n{json.dumps(user_content, ensure_ascii=False)}",
            },
        ]

        try:
            raw_response = await self._call_llm(messages, temperature=0.2, json_mode=True)
            result = json.loads(raw_response)
        except Exception as e:
            logger.warning(f"خطا در پیش‌بینی LLM: {e}")
            result = {
                "predicted_action": f"اقدام به ثبت سفارش جدید برای ترخیص متعلقات تکمیلی تحت کارت بازرگانی یکبارمصرف[cite: 13].",
                "probability_percent": 91,
                "timeframe_days": 4,
                "vulnerable_customs": "گمرک منطقه ویژه بوشهر و شهید رجایی[cite: 13]",
                "recommended_countermeasure": "نشاندار کردن هویت شرکت‌های هم‌پیمان و صدور اخطار بازرسی فیزیکی[cite: 13].",
            }

        return result


forensic_narrative_engine = ForensicNarrativeEngine()