using Dideban.Api.Domain.Ontology;
using Dideban.Api.Services;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

static void CheckEquivalent(GraphRiskScoringEngine.Result expected, GraphRiskScoringEngine.Result actual)
{
    Check(expected.Version == actual.Version, "order independence: version");
    Check(expected.Nodes.Count == actual.Nodes.Count, "order independence: node count");
    for (var i = 0; i < expected.Nodes.Count; i++)
    {
        var a = expected.Nodes[i];
        var b = actual.Nodes[i];
        Check(a.NodeId == b.NodeId, $"order independence: node ID at {i}");
        Check(Math.Abs(a.PriorityScore - b.PriorityScore) <= 1e-9,
            $"order independence: score for {a.NodeId}: {a.PriorityScore} vs {b.PriorityScore}");
        Check(a.Factors.Count == b.Factors.Count, $"order independence: factor count for {a.NodeId}");
        for (var j = 0; j < a.Factors.Count; j++)
        {
            var x = a.Factors[j];
            var y = b.Factors[j];
            Check(x.Name == y.Name && Math.Abs(x.NormalizedValue - y.NormalizedValue) <= 1e-9 &&
                  Math.Abs(x.Weight - y.Weight) <= 1e-9 &&
                  Math.Abs(x.Contribution - y.Contribution) <= 1e-9,
                $"order independence: factor {j} for {a.NodeId}");
        }
    }
}

var empty = GraphRiskScoringEngine.Score(new MultiHopDossierGraph());
Check(empty.Nodes.Count == 0, "empty");
var graph = new MultiHopDossierGraph
{
    Nodes = new()
    {
        new() { Id = "a", RiskScore = 80 },
        new() { Id = "b", RiskScore = 20 },
        new() { Id = "c", RiskScore = 40 }
    },
    Edges = new()
    {
        new() { SourceId = "a", TargetId = "b" },
        new() { SourceId = "b", TargetId = "c" }
    }
};
var first = GraphRiskScoringEngine.Score(graph);
Check(first.Nodes.Count == 3, "count");
Check(first.Nodes.All(n => n.PriorityScore is >= 0 and <= 100), "bounds");
Check(first.Nodes.All(n => Math.Abs(n.Factors.Sum(f => f.Contribution) - n.PriorityScore) < 0.001), "explanation");
Check(graph.Nodes.All(n => n.Properties.Count == 0), "input mutation");
graph.Nodes.Reverse();
graph.Edges.Reverse();
var second = GraphRiskScoringEngine.Score(graph);
CheckEquivalent(first, second);
Check(graph.Nodes.Single(n => n.Id == "a").RiskScore == 80, "risk preservation");
Console.WriteLine("PASS: empty, bounds, explanations, no mutation, order independence, risk preservation");
