namespace Dideban.Api.Domain.Dtos;

public class GraphNodeDto
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty; // PERSON, MOBILE, BANK_ACCOUNT, CUSTOMS_DOC
    public int RiskScore { get; set; } = 50;
    public Dictionary<string, string> Properties { get; set; } = new();
}

public class GraphEdgeDto
{
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public string Relation { get; set; } = string.Empty; // OWNS, TRANSFERRED_TO, CALLED, IMPORTED
    public string Detail { get; set; } = string.Empty;
}

public class CrossDomainEntityGraphDto
{
    public string TargetNationalId { get; set; } = string.Empty;
    public List<GraphNodeDto> Nodes { get; set; } = new();
    public List<GraphEdgeDto> Edges { get; set; } = new();
}