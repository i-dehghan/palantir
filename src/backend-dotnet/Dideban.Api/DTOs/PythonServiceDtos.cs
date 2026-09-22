using System.Text.Json.Serialization;

namespace Dideban.Api.DTOs;

public record PythonCompareRequest(
    [property: JsonPropertyName("order_reg_text")] string OrderRegText,
    [property: JsonPropertyName("customs_dec_text")] string CustomsDecText
);

public record PythonCompareResponse(
    [property: JsonPropertyName("text_a")] string TextA,
    [property: JsonPropertyName("text_b")] string TextB,
    [property: JsonPropertyName("fuzzy_similarity")] double FuzzySimilarity,
    [property: JsonPropertyName("semantic_similarity")] double SemanticSimilarity,
    [property: JsonPropertyName("combined_score")] double CombinedScore,
    [property: JsonPropertyName("is_mismatch")] bool IsMismatch,
    [property: JsonPropertyName("risk_level")] string RiskLevel
);