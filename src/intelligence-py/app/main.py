import os
import sys
import json
from pathlib import Path

# ۱. افزودن پوشه جاری، پوشه والد و پوشه services به sys.path جهت پشتیبانی کامل از تمام شیوه‌های اجرا
CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent
SERVICES_DIR = CURRENT_DIR / "services"

for path_dir in [str(CURRENT_DIR), str(SERVICES_DIR), str(PARENT_DIR)]:
    if path_dir not in sys.path:
        sys.path.insert(0, path_dir)

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# ۲. ایمپورت موتورهای جرم‌شناسی و تطبیق از پکیج services با مکانیزم Fallback ایمن
try:
    from services.forensic_narrative import forensic_narrative_engine
    from services.matcher import matcher_engine
except ImportError:
    try:
        from forensic_narrative import forensic_narrative_engine
        from matcher import matcher_engine
    except ImportError:
        from app.services.forensic_narrative import forensic_narrative_engine
        from app.services.matcher import matcher_engine

# بارگذاری موتور بینایی ماشین و ممیزی چندوجهی اسناد
try:
    from multimodal_ocr import multimodal_auditor
except ImportError:
    from app.multimodal_ocr import multimodal_auditor

app = FastAPI(
    title="DIDEBAN Intelligence Microservice",
    description="سرویس هوش مصنوعی جرم‌شناسی داده، استنتاج قاعده ۲-الف، پیش‌بینی ناهنجاری و پردازش چندوجهی اسناد",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NarrativeRequest(BaseModel):
    identifiers: List[str]
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None
    evidences: Optional[List[Dict[str, Any]]] = None

class CopilotRequest(BaseModel):
    identifiers: List[str]
    question: str
    chat_history: Optional[List[Dict[str, str]]] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    inferred_finished_good: Optional[str] = "تلویزیون هوشمند LED"
    inferred_hs_code: Optional[str] = "85287200"
    total_val_usd: Optional[str] = None

class PredictionRequest(BaseModel):
    identifiers: List[str]
    evidences: Optional[List[Dict[str, Any]]] = None
    inferred_product: Optional[str] = "کالای کامل الکترونیکی"

class MatcherRequest(BaseModel):
    text_a: str
    text_b: str

@app.get("/health")
async def health_check():
    return {
        "status": "ONLINE",
        "module": "DIDEBAN-AI-ENGINE",
        "port": 8000
    }

@app.post("/api/v1/forensic-narrative")
async def generate_forensic_narrative_endpoint(payload: NarrativeRequest):
    try:
        result = await forensic_narrative_engine.generate_forensic_narrative(
            identifiers=payload.identifiers,
            evidences=payload.evidences,
            graph_nodes=payload.nodes,
            graph_edges=payload.edges
        )
        return {
            "summaryNarrative": result["summaryNarrative"],
            "summary_narrative": result["summaryNarrative"],
            "riskLevel": result["riskLevel"],
            "inferredViolation": result["inferredViolation"],
            "targets": result["targets"]
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

@app.post("/api/v1/forensic-copilot")
async def chat_with_copilot_endpoint(payload: CopilotRequest):
    try:
        context_data = {
            "items": payload.nodes,
            "inferred_finished_good": payload.inferred_finished_good,
            "inferred_hs_code": payload.inferred_hs_code,
            "total_val_usd": payload.total_val_usd
        }
        result = await forensic_narrative_engine.chat_with_copilot(
            identifiers=payload.identifiers,
            question=payload.question,
            chat_history=payload.chat_history,
            context_data=context_data
        )
        return result
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

@app.post("/api/v1/predict-move")
async def predict_next_move_endpoint(payload: PredictionRequest):
    try:
        result = await forensic_narrative_engine.predict_next_move(
            identifiers=payload.identifiers,
            evidences=payload.evidences,
            inferred_product=payload.inferred_product
        )
        return result
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

@app.post("/api/v1/match-text")
async def match_text_endpoint(payload: MatcherRequest):
    return matcher_engine.calculate_similarity(payload.text_a, payload.text_b)

# intelligence-py/app/main.py (بخش اضافه شده برای شبیه‌ساز)
from app.whatif_simulator import whatif_engine

@app.post("/api/v1/what-if/simulate")
async def simulate_what_if_endpoint(payload: dict):
    """
    اندپوینت شبیه‌سازی مداخلات نظارتی و تحلیل انتشار موج اختلال در شبکه پیوندی.
    """
    intervention_type = payload.get("intervention_type", "BLOCK_ACCOUNT")
    target_id = payload.get("target_id", "14001000484")
    graph_nodes = payload.get("graph_nodes", [])
    graph_edges = payload.get("graph_edges", [])

    result = whatif_engine.simulate_intervention(
        intervention_type=intervention_type,
        target_id=target_id,
        graph_nodes=graph_nodes,
        graph_edges=graph_edges
    )
    return result

@app.post("/api/v1/multimodal/audit-document")
async def audit_document(
    file: UploadFile = File(...),
    system_data_json: str = Form(...)
):
    try:
        image_bytes = await file.read()
        system_declared = json.loads(system_data_json) if system_data_json else {}
        result = await multimodal_auditor.audit_physical_document(
            image_bytes=image_bytes,
            mime_type=file.content_type or "image/jpeg",
            system_declared_data=system_declared
        )
        return result
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"خطا در پردازش چندوجهی سند: {str(ex)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)