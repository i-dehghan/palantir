from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dideban-intelligence")

try:
    from .services.matcher import matcher_engine
except ImportError:
    from services.matcher import matcher_engine

try:
    from .services.forensic_narrative import forensic_engine
except ImportError:
    from services.forensic_narrative import forensic_engine

app = FastAPI(
    title="Dideban Intelligence Engine",
    description="سرویس هوشمند تطبیق معنایی، فازی و جرم‌شناسی اسناد تجاری دیده‌بان",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CompareRequest(BaseModel):
    order_reg_text: str = Field(..., example="روان‌نویس فوق روان اداری و مهندسی")
    customs_dec_text: str = Field(..., example="مداد گرافیتی مشکی و رنگی بسته‌ای")

class CompareResponse(BaseModel):
    text_a: str
    text_b: str
    fuzzy_similarity: float
    semantic_similarity: float
    combined_score: float
    is_mismatch: bool
    risk_level: str

class BatchCompareItem(BaseModel):
    id: str
    order_reg_text: Optional[str] = ""
    customs_dec_text: Optional[str] = ""

class BatchCompareResponseItem(BaseModel):
    id: str
    result: CompareResponse

class ForensicDossierRequest(BaseModel):
    identifiers: List[str]
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    declared_parts: Optional[List[Dict[str, Any]]] = []
    inferred_finished_good: Optional[str] = ""
    inferred_hs_code: Optional[str] = ""

class ForensicDossierResponse(BaseModel):
    case_id: str
    summary_narrative: str

class PredictMoveRequest(BaseModel):
    identifiers: List[str]
    evidences: List[Dict[str, Any]] = []
    inferred_product: Optional[str] = "تلویزیون هوشمند"

class PredictMoveResponse(BaseModel):
    predicted_action: str
    probability_percent: int
    timeframe_days: int
    vulnerable_customs: str
    recommended_countermeasure: str

class CopilotChatRequest(BaseModel):
    identifiers: List[str]
    question: str
    chat_history: List[Dict[str, str]] = []
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    inferred_finished_good: Optional[str] = "تلویزیون هوشمند LED"
    inferred_hs_code: Optional[str] = "85287200"
    total_val_usd: Optional[str] = "$703,500"

class CopilotChatResponse(BaseModel):
    answer: str


def get_identical_response(t1: str, t2: str) -> CompareResponse:
    return CompareResponse(
        text_a=t1, text_b=t2, fuzzy_similarity=100.0,
        semantic_similarity=100.0, combined_score=100.0,
        is_mismatch=False, risk_level="LOW"
    )

def get_fallback_empty_response(t1: str, t2: str) -> CompareResponse:
    return CompareResponse(
        text_a=t1, text_b=t2, fuzzy_similarity=0.0,
        semantic_similarity=0.0, combined_score=0.0,
        is_mismatch=True, risk_level="CRITICAL"
    )


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "dideban-intelligence",
        "engine_ready": matcher_engine is not None
    }


@app.post("/api/v1/compare-text", response_model=CompareResponse)
def compare_text(payload: CompareRequest):
    t1 = (payload.order_reg_text or "").strip()
    t2 = (payload.customs_dec_text or "").strip()

    if not t1 or not t2:
        raise HTTPException(status_code=400, detail="متون ورودی نمی‌توانند خالی باشند.")
    if t1 == t2:
        return get_identical_response(t1, t2)

    try:
        return matcher_engine.calculate_similarity(t1, t2)
    except Exception as ex:
        logger.error(f"خطا در پردازش NLP تکی: {ex}")
        raise HTTPException(status_code=500, detail=f"خطای موتور تطبیق: {str(ex)}")


@app.post("/api/v1/compare-batch", response_model=List[BatchCompareResponseItem])
def compare_batch(items: List[BatchCompareItem]):
    if not items:
        return []

    results: List[BatchCompareResponseItem] = []
    for item in items:
        t1 = (item.order_reg_text or "").strip()
        t2 = (item.customs_dec_text or "").strip()

        if not t1 and not t2:
            results.append(BatchCompareResponseItem(id=item.id, result=get_identical_response(t1, t2)))
            continue
        if t1 == t2:
            results.append(BatchCompareResponseItem(id=item.id, result=get_identical_response(t1, t2)))
            continue

        try:
            res = matcher_engine.calculate_similarity(t1, t2)
            res_model = CompareResponse(**res) if isinstance(res, dict) else res
            results.append(BatchCompareResponseItem(id=item.id, result=res_model))
        except Exception as ex:
            logger.warning(f"خطا در پردازش شناسه {item.id}: {ex}")
            results.append(BatchCompareResponseItem(id=item.id, result=get_fallback_empty_response(t1, t2)))

    return results


@app.post("/api/v1/forensic-narrative", response_model=ForensicDossierResponse)
async def generate_forensic_narrative(payload: ForensicDossierRequest):
    if not payload.identifiers or len(payload.identifiers) < 2:
        raise HTTPException(status_code=400, detail="حداقل دو شناسه الزامی است.")

    narrative = await forensic_engine.generate_narrative_async(
        target_ids=payload.identifiers,
        nodes=payload.nodes,
        edges=payload.edges,
        declared_parts=payload.declared_parts or [],
        inferred_finished_good=payload.inferred_finished_good or "",
        inferred_hs_code=payload.inferred_hs_code or ""
    )

    case_suffix = payload.identifiers[0][-4:] if len(payload.identifiers[0]) >= 4 else payload.identifiers[0]
    return ForensicDossierResponse(case_id=f"CASE-AI-{case_suffix}", summary_narrative=narrative)


@app.post("/api/v1/predict-next-move", response_model=PredictMoveResponse)
async def predict_next_move(payload: PredictMoveRequest):
    if not payload.identifiers:
        raise HTTPException(status_code=400, detail="شناسه سوژه الزامی است.")

    result = await forensic_engine.predict_next_move_async(
        target_ids=payload.identifiers,
        evidences=payload.evidences,
        inferred_product=payload.inferred_product or "تلویزیون هوشمند"
    )
    return PredictMoveResponse(**result)


@app.post("/api/v1/forensic-copilot/chat", response_model=CopilotChatResponse)
async def chat_with_copilot(payload: CopilotChatRequest):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="متن سوال نمی‌تواند خالی باشد.")

    answer = await forensic_engine.chat_copilot_async(
        target_ids=payload.identifiers,
        chat_history=payload.chat_history,
        user_question=payload.question,
        nodes=payload.nodes,
        edges=payload.edges,
        inferred_finished_good=payload.inferred_finished_good,
        inferred_hs_code=payload.inferred_hs_code,
        total_val_usd=payload.total_val_usd
    )
    return CopilotChatResponse(answer=answer)