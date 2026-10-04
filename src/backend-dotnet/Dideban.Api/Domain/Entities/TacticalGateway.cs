using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Dideban.Api.Domain.Entities;

[Table("TacticalGateways")]
public class TacticalGateway
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Required]
    public string Name { get; set; } = string.Empty;

    [Required]
    public string Code { get; set; } = string.Empty;

    public string Domain { get; set; } = "CUSTOMS";

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    public int RiskScore { get; set; }

    public int TrafficVolume { get; set; } = 100;

    public bool IsActive { get; set; } = true;
}