using Dideban.Api.Domain.Entities;
using System.ComponentModel.DataAnnotations;

namespace Dideban.Api.DTOs
{
    public record CreateRuleDto(
    [Required] string RuleName,
    [Required] string SourceTableA,
    [Required] string SourceFieldA,
    [Required] string SourceTableB,
    [Required] string SourceFieldB,
    [Required] MatchingStrategy Strategy,
    [Range(0, 100)] double ToleranceOrThreshold
);

    public record UpdateRuleDto(
        [Required] string RuleName,
        [Required] string SourceTableA,
        [Required] string SourceFieldA,
        [Required] string SourceTableB,
        [Required] string SourceFieldB,
        [Required] MatchingStrategy Strategy,
        [Range(0, 100)] double ToleranceOrThreshold,
        bool IsActive
    );

    public record RuleResponseDto(
        int Id,
        string RuleName,
        string SourceTableA,
        string SourceFieldA,
        string SourceTableB,
        string SourceFieldB,
        MatchingStrategy Strategy,
        double ToleranceOrThreshold,
        bool IsActive
    );
}
