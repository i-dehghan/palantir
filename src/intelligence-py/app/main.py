import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from forensic_narrative import forensic_narrative_engine
from matcher import matcher_engine

app = FastAPI(
    title="DIDEBAN Intelligence Microservice",
    description="سرویس هوش مصنوعی جرم‌شناسی داده، استنتاج قاعده ۲-الف و پیش‌بینی ناهنجاری",
    version="2.0.0"
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
    return {"status": "ONLINE", "module": "DIDEBAN-AI-ENGINE", "port": 8000}

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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)