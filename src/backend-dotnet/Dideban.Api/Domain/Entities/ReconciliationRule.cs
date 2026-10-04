using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Dideban.Api.Domain.Entities;

public enum MatchingStrategy
{
    Exact = 0,
    Fuzzy = 1,
    NumericTolerance = 2
}

[Table("ReconciliationRules")]
public class ReconciliationRule
{
    [Key]
    [Column("Id")]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    [Column("RuleName")]
    public string RuleName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [Column("SourceTableA")]
    public string SourceTableA { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [Column("SourceFieldA")]
    public string SourceFieldA { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [Column("SourceTableB")]
    public string SourceTableB { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [Column("SourceFieldB")]
    public string SourceFieldB { get; set; } = string.Empty;

    [Column("Strategy")]
    public MatchingStrategy Strategy { get; set; } = MatchingStrategy.Exact;

    [Column("ToleranceOrThreshold")]
    public double ToleranceOrThreshold { get; set; } = 1.0;

    [Column("IsActive")]
    public bool IsActive { get; set; } = true;
}