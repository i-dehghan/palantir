using Dideban.Api.Domain.Ontology;
using Dideban.Api.Services;

namespace Dideban.Api.Domain.Dtos;

public sealed class GraphRiskAnalysisRequestDto
{
    public MultiHopDossierGraph? Graph { get; set; }
    public int MaxHops { get; set; } = 3;
    public double Decay { get; set; } = 0.5;
    public double InfluenceCap { get; set; } = 25;
}

public sealed record GraphRiskAnalysisResponseDto(
    string ScoringVersion,
    string PropagationVersion,
    string Disclaimer,
    IReadOnlyList<GraphRiskScoringEngine.NodeResult> Baseline,
    IReadOnlyList<GraphRiskPropagationEngine.NodeResult> Propagation,
    GraphRiskPropagationEngine.Settings Settings);
