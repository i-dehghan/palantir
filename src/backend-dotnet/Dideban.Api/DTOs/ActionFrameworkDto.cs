namespace Dideban.Api.Domain.Dtos;

public class ExecuteActionRequestDto
{
    public string CaseId { get; set; } = string.Empty;
    public string TargetNationalId { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty; // BLOCK_CUSTOMS_CLEARANCE, FREEZE_BANK_ACCOUNT, FLAG_RED_LIST
    public string Reason { get; set; } = string.Empty;
    public string OfficerBadgeNumber { get; set; } = "SEC-8842";
}

public class ActionExecutionResultDto
{
    public bool Success { get; set; }
    public string TrackingNumber { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string ExecutedAtShamsi { get; set; } = string.Empty;
}