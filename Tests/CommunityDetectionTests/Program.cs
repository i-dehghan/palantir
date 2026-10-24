using Dideban.Api.Domain.Ontology;
using Dideban.Api.Services;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception("FAIL: " + message);
}
static MultiHopDossierGraph Graph(params string[] ids) => new()
{
    Nodes = ids.Select(id => new OntologyNode { Id = id, RiskScore = 42 }).ToList()
};
static void Link(MultiHopDossierGraph g, string a, string b, double weight = 1) =>
    g.Edges.Add(new OntologyEdge { SourceId = a, TargetId = b, Weight = weight });

var empty = Graph();
Check(GraphCommunityDetectionEngine.Analyze(empty).Assignments.Count == 0, "empty");
var isolated = Graph("a", "b", "c");
var iso = GraphCommunityDetectionEngine.Analyze(isolated);
Check(iso.CommunitySizes.Count == 3 && iso.Modularity == 0 && iso.BridgeNodeIds.Count == 0, "isolated");

var g = Graph("a", "b", "c", "d", "e", "f");
Link(g, "a", "b", 8); Link(g, "a", "c", 8); Link(g, "b", "c", 8);
Link(g, "d", "e", 8); Link(g, "d", "f", 8); Link(g, "e", "f", 8);
Link(g, "c", "d", 0.2);
var result = GraphCommunityDetectionEngine.Analyze(g);
Check(result.Assignments["a"] == result.Assignments["b"] && result.Assignments["b"] == result.Assignments["c"], "first cluster");
Check(result.Assignments["d"] == result.Assignments["e"] && result.Assignments["e"] == result.Assignments["f"], "second cluster");
Check(result.Assignments["a"] != result.Assignments["d"] && result.Modularity > 0.4, "separation/modularity");
Check(result.BridgeNodeIds.SequenceEqual(new[] { "c", "d" }), "bridge nodes");
Check(g.Nodes.All(n => n.RiskScore == 42), "risk isolation");
var repeat = GraphCommunityDetectionEngine.Analyze(g);
Check(result.Assignments.OrderBy(x => x.Key).SequenceEqual(repeat.Assignments.OrderBy(x => x.Key)), "repeatability");

var reverse = Graph("f", "e", "d", "c", "b", "a");
foreach (var edge in g.Edges.AsEnumerable().Reverse()) Link(reverse, edge.TargetId, edge.SourceId, edge.Weight);
var reversed = GraphCommunityDetectionEngine.Analyze(reverse);
Check(result.Assignments.OrderBy(x => x.Key).SequenceEqual(reversed.Assignments.OrderBy(x => x.Key)), "order/direction independence");

var invalid = Graph("a", "b");
Link(invalid, "a", "b", -1); Link(invalid, "a", "a", 10);
Check(GraphCommunityDetectionEngine.Analyze(invalid).CommunitySizes.Count == 2, "invalid edges");
Console.WriteLine("PASS: empty, isolated, weighted clusters, modularity, bridges, risk isolation, repeatability, order independence, invalid edges");
