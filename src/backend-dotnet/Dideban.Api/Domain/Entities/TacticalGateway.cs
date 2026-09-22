using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Dideban.Api.Domain.Entities;

[Table("TacticalGateways")]
public class TacticalGateway
{
    [Key]
    [Column("Code")]
    public string Code { get; set; } = string.Empty;

    [Column("Domain")]
    public string Domain { get; set; } = string.Empty;

    [Column("Name")]
    public string Name { get; set; } = string.Empty;

    [Column("Province")]
    public string? Province { get; set; }

    [Column("Longitude")]
    public string? RawLongitude { get; set; }

    [Column("Latitude")]
    public string? RawLatitude { get; set; }

    [Column("Category")]
    public string? Category { get; set; }

    [Column("RiskScore")]
    public string? RawRiskScore { get; set; }

    // خصوصیات محاسباتی جهت استفاده راحت و تبدیل رشته به عدد
    [NotMapped]
    public double Longitude => double.TryParse(RawLongitude, System.Globalization.CultureInfo.InvariantCulture, out var val) ? val : 0.0;

    [NotMapped]
    public double Latitude => double.TryParse(RawLatitude, System.Globalization.CultureInfo.InvariantCulture, out var val) ? val : 0.0;

    [NotMapped]
    public int RiskScore => int.TryParse(RawRiskScore, out var val) ? val : 75;
}