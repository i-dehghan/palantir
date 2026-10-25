using Dideban.Api.Domain.Ontology;
using Dideban.Api.Security;
using Dideban.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Dideban.Api.Controllers;

/// <summary>On-demand community analysis for an already authorized dossier graph.</summary>
[ApiController]
[Route("api/audit/graph-communities")]
[Authorize(Policy = RegistryPermissions.AuditRead)]
public sealed class GraphCommunitiesController : ControllerBase
{
    [HttpPost("analyze")]
    [RequestSizeLimit(2_000_000)]
    public ActionResult<GraphCommunitiesResponse> Analyze([FromBody] MultiHopDossierGraph? graph)
    {
        if (graph is null) return BadRequest(new { error = "Graph is required." });
        if (graph.Nodes is null || graph.Edges is null)
            return BadRequest(new { error = "Nodes and edges are required." });
        if (graph.Nodes.Count > 500 || graph.Edges.Count > 5_000)
            return BadRequest(new { error = "Graph exceeds interactive analysis limits (500 nodes / 5000 edges)." });
        if (graph.Nodes.Any(n => n is null || string.IsNullOrWhiteSpace(n.Id)) ||
            graph.Nodes.Select(n => n.Id).Distinct(StringComparer.Ordinal).Count() != graph.Nodes.Count)
            return BadRequest(new { error = "Node IDs must be unique and non-empty." });
        if (graph.Edges.Any(e => e is null || !double.IsFinite(e.Weight) || e.Weight <= 0))
            return BadRequest(new { error = "Edge weights must be finite positive numbers." });

        // Clone before analysis: engine annotates node properties in place.
        var safeGraph = new MultiHopDossierGraph
        {
            RootEntityId = graph.RootEntityId,
            ExploredDepth = graph.ExploredDepth,
            Nodes = graph.Nodes.Select(n => new OntologyNode
            {
                Id = n.Id,
                Type = n.Type,
                DisplayLabel = n.DisplayLabel,
                RiskScore = n.RiskScore,
                Properties = new Dictionary<string, object>(n.Properties ?? new Dictionary<string, object>())
            }).ToList(),
            Edges = graph.Edges.Select(e => new OntologyEdge
            {
                SourceId = e.SourceId,
                TargetId = e.TargetId,
                Predicate = e.Predicate,
                Weight = e.Weight,
                Timestamp = e.Timestamp
            }).ToList()
        };

        try
        {
            var result = GraphCommunityDetectionEngine.Analyze(safeGraph);
            return Ok(new GraphCommunitiesResponse(
                result.Assignments,
                result.CommunitySizes,
                result.BridgeNodeIds,
                result.Modularity,
                result.Passes,
                result.Method));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

public sealed record GraphCommunitiesResponse(
    IReadOnlyDictionary<string, int> Assignments,
    IReadOnlyDictionary<int, int> CommunitySizes,
    IReadOnlyList<string> BridgeNodeIds,
    double Modularity,
    int Passes,
    string Method);
