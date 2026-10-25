using Dideban.Api.Domain.Ontology;
using Dideban.Api.Services;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
static MultiHopDossierGraph Make(string[] ids, params (string A, string B, double W)[] edges) => new()
{
    Nodes = ids.Select((id, i) => new OntologyNode { Id = id, RiskScore = i == 0 ? 90 : 0 }).ToList(),
    Edges = edges.Select(e => new OntologyEdge { SourceId = e.A, TargetId = e.B, Weight = e.W }).ToList()
};
static GraphRiskPropagationEngine.Result Run(MultiHopDossierGraph g, GraphRiskPropagationEngine.Settings? settings = null)
    => GraphRiskPropagationEngine.Propagate(g, GraphRiskScoringEngine.Score(g), settings);

var empty = Run(Make([]));
Check(empty.Nodes.Count == 0, "empty");
var isolated = Run(Make(["a", "b"]));
Check(isolated.Nodes.All(n => n.NetworkInfluence == 0 && n.Sources.Count == 0), "isolated");
var chain = Make(["a", "b", "c", "d"], ("a", "b", 1), ("b", "c", 1), ("c", "d", 1));
var originalRisk = chain.Nodes.Select(n => n.RiskScore).ToArray();
var first = Run(chain);
Check(first.Nodes.All(n => n.NetworkInfluence is >= 0 and <= 25 && n.CombinedIndex is >= 0 and <= 100), "bounds");
Check(first.Nodes.Single(n => n.NodeId == "b").Sources.Any(s => s.SourceId == "a" && s.Hops == 1), "source attribution");
Check(first.Nodes.Single(n => n.NodeId == "d").Sources.Any(s => s.SourceId == "a" && s.Hops == 3), "three hops");
Check(!Run(chain, new(2)).Nodes.Single(n => n.NodeId == "d").Sources.Any(s => s.SourceId == "a"), "hop limit");
Check(chain.Nodes.Select(n => n.RiskScore).SequenceEqual(originalRisk), "no mutation");
var cycle = Make(["a", "b", "c"], ("a", "b", 1), ("b", "c", 1), ("c", "a", 1));
var cycled = Run(cycle);
Check(cycled.Nodes.All(n => n.Sources.All(s => s.Path.Distinct().Count() == s.Path.Count && s.Path[0] != s.Path[^1])), "cycle protection");
var reordered = Make(["d", "c", "b", "a"], ("c", "d", 1), ("b", "c", 1), ("a", "b", 1));
foreach (var n in reordered.Nodes) n.RiskScore = n.Id == "a" ? 90 : 0;
var second = Run(reordered);
foreach (var a in first.Nodes)
{
    var b = second.Nodes.Single(n => n.NodeId == a.NodeId);
    Check(Math.Abs(a.BaseScore - b.BaseScore) < 1e-6 && Math.Abs(a.NetworkInfluence - b.NetworkInfluence) < 1e-6, "order independence: score");
    Check(a.Sources.Select(s => (s.SourceId, s.Hops, s.Contribution, Path: string.Join("/", s.Path)))
        .SequenceEqual(b.Sources.Select(s => (s.SourceId, s.Hops, s.Contribution, Path: string.Join("/", s.Path)))), "order independence: paths");
}
var duplicate = Make(["a", "b"], ("a", "b", 1), ("b", "a", 1), ("a", "b", 1));
var single = Make(["a", "b"], ("a", "b", 1));
// Isolate propagation from upstream scoring: the scoring engine may compute
// different PageRank values when its input contains repeated edges.
// Propagation must deduplicate reverse/parallel edges for an identical baseline.
var sharedBaseline = GraphRiskScoringEngine.Score(single);
var duplicatePropagation = GraphRiskPropagationEngine.Propagate(duplicate, sharedBaseline);
var singlePropagation = GraphRiskPropagationEngine.Propagate(single, sharedBaseline);
Check(duplicatePropagation.Nodes.Select(n => (n.NodeId, n.NetworkInfluence, n.CombinedIndex))
    .SequenceEqual(singlePropagation.Nodes.Select(n => (n.NodeId, n.NetworkInfluence, n.CombinedIndex))), "duplicate edge handling");
var weighted = Make(["a", "b", "c"], ("a", "b", 5), ("a", "c", 1));
var w = Run(weighted);
Check(w.Nodes.Single(n => n.NodeId == "b").Sources.Single(s => s.SourceId == "a").Contribution >
      w.Nodes.Single(n => n.NodeId == "c").Sources.Single(s => s.SourceId == "a").Contribution, "edge weighting");
var invalid = false;
try { Run(chain, new(3, 1.2)); } catch (ArgumentOutOfRangeException) { invalid = true; }
Check(invalid, "invalid settings");
Console.WriteLine("PASS: empty, isolated, bounds, attribution, hop limit, no mutation, cycle protection, order independence, duplicate edges, edge weighting, invalid settings");
