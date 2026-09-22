namespace Dideban.Api.Domain.Entities
{
    public class DiscrepancyLog
    {
        public int Id { get; set; }
        public string DomainType { get; set; } = "CUSTOMS"; // اضافه شد
        public string OrderRegNumber { get; set; } = string.Empty;
        public string CottageNumber { get; set; } = string.Empty;
        public string ImporterNationalId { get; set; } = string.Empty;
        public string RuleName { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int RiskScore { get; set; } // ۰ تا ۱۰۰
        public DateTime DetectedAt { get; set; } = DateTime.UtcNow;
    }
}
