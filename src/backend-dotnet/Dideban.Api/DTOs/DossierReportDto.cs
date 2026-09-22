namespace Dideban.Api.Domain.Dtos;

public class EvidenceItemDto
{
    public string Category { get; set; } = string.Empty; // BANKING, TELECOM, CUSTOMS
    public string Title { get; set; } = string.Empty;
    public string ReferenceNumber { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public double FinancialValueIrr { get; set; }
}

public class DossierReportDto
{
    public string CaseReference { get; set; } = string.Empty;
    public string GeneratedAtShamsi { get; set; } = string.Empty;
    public string TargetNationalId { get; set; } = string.Empty;
    public int GlobalRiskScore { get; set; }
    public string ClassificationLevel { get; set; } = "محرمانه // ویژه مراجع نظارتی";
    public string ExecutiveSummary { get; set; } = string.Empty;
    public List<string> DetectedViolations { get; set; } = new();
    public List<EvidenceItemDto> Evidences { get; set; } = new();
    public int TotalEntitiesLinked { get; set; }
    public int TotalTransactionsFlagged { get; set; }
}