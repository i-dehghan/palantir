# intelligence-py/test_engine.py
import asyncio
from app.forensic_narrative import forensic_narrative_engine

async def run_tests():
    print("--- شروع تست موتور تحلیلی و یادگیرنده دیده‌بان ---")

    # ۱. تست بارگذاری قواعد یادگرفته‌شده جدید (قابلیت یادگیری)
    rules_added = forensic_narrative_engine.load_rules_and_data(
        rules_payload=[
            {"keyword": "TV_65", "title": "مغایرت قاعده ۲-الف تلویزیون", "description": "تفکیک پنل و مین‌برد تلویزیون ۶۵ اینچ"}
        ],
        knowledge_files=[
            {"doc_id": "REF-9984", "content": "پرونده پیشین شرکت بازرگانی آریا"}
        ]
    )
    print(f"✔ تست یادگیری قواعد: {rules_added} قاعده با موفقیت تزریق شد.")

    # ۲. تست تولید گزارش نریتیو (آفلاین / حالت کات‌شدن اینترنت)
    narrative_res = await forensic_narrative_engine.generate_forensic_narrative(
        identifiers=["14001000484", "0081293812"],
        evidences=[{"title": "کوتاژ ۹۹۸۴", "description": "TV_65 وارداتی"}],
        graph_nodes=[{"id": "ACC_123", "riskScore": 90}],
        graph_edges=[]
    )
    print("\n--- نتیجه تست تولید گزارش نریتیو (Engine Mode: " + narrative_res.get("engine_mode", "") + ") ---")
    print(narrative_res.get("summary_narrative"))

    # ۳. تست چت با دستیار (Copilot)
    chat_res = await forensic_narrative_engine.chat_with_copilot(
        identifiers=["14001000484"],
        question="تعرفه این اقلام چیست؟"
    )
    print("\n--- نتیجه تست چت با کاپایلوت ---")
    print(chat_res.get("answer"))

    # ۴. تست پیش‌بینی رفتار آتی
    pred_res = await forensic_narrative_engine.predict_next_move(
        identifiers=["14001000484"],
        inferred_product="تلویزیون هوشمند"
    )
    print("\n--- نتیجه تست پیش‌بینی اقدام آتی ---")
    print(pred_res)

if __name__ == "__main__":
    asyncio.run(run_tests())