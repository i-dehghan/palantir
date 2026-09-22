namespace Dideban.Api.Domain.Entities;

public class AuditRule
{
    public int Id { get; set; }
    public string DomainType { get; set; } = "CUSTOMS"; // اضافه شد: CUSTOMS, BANKING, TELECOM
    public string RuleCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string SourceTable { get; set; } = string.Empty;
    public string SourceField { get; set; } = string.Empty;
    public string TargetTable { get; set; } = string.Empty;
    public string TargetField { get; set; } = string.Empty;
    public string RuleType { get; set; } = string.Empty; // FuzzyNLP, Tolerance, Range, AggregationCount
    public double Threshold { get; set; }
    public bool IsActive { get; set; } = true;
    public int RiskWeight { get; set; } = 80;
}