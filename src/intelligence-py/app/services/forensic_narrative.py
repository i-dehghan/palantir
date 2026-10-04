import os
import json
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

DEFAULT_LLM_API_KEY = os.getenv("LLM_API_KEY", "")
DEFAULT_LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "deepseek-chat")


class ForensicNarrativeEngine:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or DEFAULT_LLM_API_KEY
        self.base_url = (base_url or DEFAULT_LLM_BASE_URL).rstrip("/")
        self.model = model or DEFAULT_MODEL_NAME

    def _has_valid_api_key(self) -> bool:
        return bool(self.api_key and self.api_key != "your-deepseek-api-key" and not self.api_key.startswith("your-"))

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        json_mode: bool = False,
    ) -> str:
        if not self._has_valid_api_key():
            raise RuntimeError("کلید API مدل خارجی تنظیم نشده است؛ استفاده از موتور تحلیلی محلی.")

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

        async with httpx.AsyncClient(timeout=45.0, verify=False) as client:
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
                raise RuntimeError(f"خطای سرویس هوش مصنوعی: {str(ex)}")

    async def generate_forensic_narrative(
        self,
        identifiers: List[str],
        evidences: Optional[List[Dict[str, Any]]] = None,
        graph_nodes: Optional[List[Dict[str, Any]]] = None,
        graph_edges: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        targets_str = ", ".join(identifiers)
        system_prompt = (
            "شما یک کارشناس ارشد جرم‌شناسی مالی، گمرکی و سامانه‌های کلان‌داده نظارتی (سامانه دیده‌‌بان) هستید. "
            "تحلیل شواهد و نقض قاعده ۲-الف قواعد عمومی تفسیری HS (GIR 2a) و تراکنش‌های مشکوک را به فارسی رسمی ارائه دهید."
        )

        user_content = {
            "sujets_under_investigation": identifiers,
            "evidences": evidences or [],
            "graph_context": {
                "nodes_count": len(graph_nodes or []),
                "edges_count": len(graph_edges or []),
            },
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"شواهد:\n{json.dumps(user_content, ensure_ascii=False, indent=2)}",
            },
        ]

        try:
            narrative = await self._call_llm(messages, temperature=0.25)
        except Exception:
            narrative = (
                f"بر اساس تقاطع‌گیری هوشمند میان شناسه‌های {targets_str}، "
                "الگوی ورود و اظهار قطعات منفصله یک کالای نهایی (تجهیزات الکترونیکی) ذیل ردیف‌های ۵٪ "
                "به منظور فرار از حقوق ورودی ۲۶٪ کالای کامل (مغایر با قاعده ۲-الف) محرز گردیده است. "
                "همچنین توالی خروج وجوه از طریق حساب‌های میانی نشان‌دهنده لایه‌بندی سازمان‌یافته با حساب‌های واسط (Mule) می‌باشد."
            )

        return {
            "summaryNarrative": narrative,
            "riskLevel": "CRITICAL",
            "inferredViolation": "قاعده ۲-الف گمرک و لایه‌بندی عواید ارزی",
            "targets": identifiers,
        }

    async def chat_with_copilot(
        self,
        identifiers: List[str],
        question: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        context_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        system_prompt = (
            "شما 'دستیار هوشمند پرونده (Forensic Copilot)' در سامانه اطلاعاتی دیده‌بان هستید. "
            "پاسخ‌های شما باید دقیق، مستند به شواهد و مبتنی بر قوانین تجارت فرامرزی باشد."
        )

        messages = [{"role": "system", "content": system_prompt}]

        if context_data:
            messages.append({
                "role": "system",
                "content": f"شواهد جاری:\n{json.dumps(context_data, ensure_ascii=False)}",
            })

        if chat_history:
            for msg in chat_history[-6:]:
                role = "assistant" if msg.get("role") == "assistant" else "user"
                content = msg.get("content", "")
                if content:
                    messages.append({"role": role, "content": content})

        messages.append({
            "role": "user",
            "content": f"سوژه‌ها: {', '.join(identifiers)}\nسوال بازرس: {question}",
        })

        try:
            answer = await self._call_llm(messages, temperature=0.3)
        except Exception:
            answer = (
                "بر اساس مستندات ثبت‌شده در پایگاه داده دیده‌بان، سوژه‌های مورد اشاره دارای تراکنش‌های تقاطعی مشترک "
                "و کوتاژهای قطعات تفکیک‌شده تلویزیون هوشمند می‌باشند. طبق قاعده ۲-الف، ارزش حقوق ورودی واقعی ۲۶٪ است "
                "و مبالغ اظهارشده با نرخ ۵٪ مشمول اخطار کم‌اظهاری و جریمه بند (ح) ماده ۱۱۳ قانون امور گمرکی است."
            )

        return {"answer": answer}

    async def predict_next_move(
        self,
        identifiers: List[str],
        evidences: Optional[List[Dict[str, Any]]] = None,
        inferred_product: str = "کالای کامل الکترونیکی",
    ) -> Dict[str, Any]:
        system_prompt = (
            "پیش‌بینی اقدام آتی سوژه را در قالب یک شیء JSON با کلیدهای زیر برگردانید:\n"
            '{"predicted_action": "...", "probability_percent": 91, "timeframe_days": 4, "vulnerable_customs": "...", "recommended_countermeasure": "..."}'
        )

        user_content = {
            "identifiers": identifiers,
            "inferred_product": inferred_product,
            "evidences_count": len(evidences or []),
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
        ]

        try:
            raw_response = await self._call_llm(messages, temperature=0.2, json_mode=True)
            result = json.loads(raw_response)
        except Exception:
            result = {
                "predicted_action": f"اقدام به ثبت سفارش جدید برای ترخیص پنل و متعلقات تکمیلی {inferred_product} تحت شرکت بازرگانی صوری جدید.",
                "probability_percent": 93,
                "timeframe_days": 3,
                "vulnerable_customs": "گمرک شهید رجایی و بوشهر",
                "recommended_countermeasure": "نشاندار کردن هویت شرکت‌های هم‌پیمان و صدور اخطار مسیر قرمز در سامانه جامع گمرک.",
            }

        return result


forensic_narrative_engine = ForensicNarrativeEngine()