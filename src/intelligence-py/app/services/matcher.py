from rapidfuzz import fuzz


class TextMatchingEngine:
    def __init__(self):
        pass

    def calculate_similarity(self, text_a: str, text_b: str) -> dict:
        clean_a = text_a.strip()
        clean_b = text_b.strip()

        token_ratio = fuzz.token_sort_ratio(clean_a, clean_b) / 100.0
        partial_ratio = fuzz.partial_ratio(clean_a, clean_b) / 100.0

        combined_score = round((token_ratio * 0.7) + (partial_ratio * 0.3), 3)

        is_mismatch = combined_score < 0.60
        risk_level = "LOW"
        if combined_score < 0.40:
            risk_level = "CRITICAL"
        elif combined_score < 0.60:
            risk_level = "HIGH"
        elif combined_score < 0.75:
            risk_level = "MEDIUM"

        return {
            "text_a": clean_a,
            "text_b": clean_b,
            "fuzzy_similarity": round(token_ratio, 3),
            "semantic_similarity": round(partial_ratio, 3),
            "combined_score": combined_score,
            "is_mismatch": is_mismatch,
            "risk_level": risk_level,
        }


matcher_engine = TextMatchingEngine()