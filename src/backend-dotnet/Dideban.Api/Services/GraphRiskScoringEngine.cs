using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// Deterministic investigation-priority index, NOT a probability or finding of wrongdoing.
/// Does not modify OntologyNode.RiskScore or graph properties.
/// </summary>
public static class GraphRiskScoringEngine
{
    public sealed record Factor(string Name, double NormalizedValue, double Weight, double Contribution);
    public sealed record NodeResult(string NodeId, double PriorityScore, IReadOnlyList<Factor> Factors);
    public sealed record Result(string Version, IReadOnlyList<NodeResult> Nodes);

    public static Result Score(MultiHopDossierGraph graph)
    {
        ArgumentNullException.ThrowIfNull(graph);
        var nodes = (graph.Nodes ?? new List<OntologyNode>()).OrderBy(n => n.Id, StringComparer.Ordinal).ToArray();
        if (nodes.Any(n => string.IsNullOrWhiteSpace(n.Id)) ||
            nodes.Select(n => n.Id).Distinct(StringComparer.Ordinal).Count() != nodes.Length)
            throw new ArgumentException("Node IDs must be unique and non-empty.", nameof(graph));
        if (nodes.Length == 0) return new Result("3.1.6.1", Array.Empty<NodeResult>());

        var ids = nodes.Select((n, i) => (n.Id, i)).ToDictionary(x => x.Id, x => x.i, StringComparer.Ordinal);
        var neighbors = Enumerable.Range(0, nodes.Length).Select(_ => new HashSet<int>()).ToArray();
        foreach (var edge in graph.Edges ?? new List<OntologyEdge>())
        {
            if (edge is null || !double.IsFinite(edge.Weight) || edge.Weight <= 0 ||
                !ids.TryGetValue(edge.SourceId, out var a) || !ids.TryGetValue(edge.TargetId, out var b) || a == b)
                continue;
            neighbors[a].Add(b);
            neighbors[b].Add(a);
        }

        // Centralities are computed on a private copy, never on the supplied graph.
        var copy = new MultiHopDossierGraph
        {
            Nodes = nodes.Select(n => new OntologyNode { Id = n.Id, Type = n.Type }).ToList(),
            Edges = (graph.Edges ?? new List<OntologyEdge>())
                .Where(e => e is not null)
                .Select(e => new OntologyEdge { SourceId = e.SourceId, TargetId = e.TargetId, Weight = e.Weight })
                .ToList()
        };
        GraphAnalyticsEngine.ComputeCentralityAndRisk(copy);
        var centrality = copy.Nodes.ToDictionary(n => n.Id, StringComparer.Ordinal);
        var maxDegree = Math.Max(1, neighbors.Max(n => n.Count));
        var maxRank = Math.Max(1e-12, centrality.Values.Max(n => Convert.ToDouble(n.Properties["PageRankScore"])));
        var maxBetween = Math.Max(1e-12, centrality.Values.Max(n => Convert.ToDouble(n.Properties["BetweennessCentrality"])));

        var output = new List<NodeResult>(nodes.Length);
        for (var i = 0; i < nodes.Length; i++)
        {
            var metrics = centrality[nodes[i].Id].Properties;
            var features = new (string Name, double Value, double Weight)[]
            {
                ("ObservedRiskSignal", Math.Clamp(nodes[i].RiskScore / 100.0, 0, 1), 0.45),
                ("UndirectedDegree", neighbors[i].Count / (double)maxDegree, 0.20),
                ("PageRank", Convert.ToDouble(metrics["PageRankScore"]) / maxRank, 0.20),
                ("Betweenness", Convert.ToDouble(metrics["BetweennessCentrality"]) / maxBetween, 0.15)
            };
            var factors = features.Select(f => new Factor(f.Name, Math.Round(f.Value, 6), f.Weight,
                Math.Round(f.Value * f.Weight * 100, 6))).ToArray();
            output.Add(new NodeResult(nodes[i].Id,
                Math.Round(features.Sum(f => f.Value * f.Weight) * 100, 4), factors));
        }
        return new Result("3.1.6.1", output);
    }
}
