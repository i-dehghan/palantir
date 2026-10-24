using Dideban.Api.Domain.Ontology;
using Dideban.Api.Services;

static MultiHopDossierGraph Graph(string[] ids, params (string source, string target, double weight)[] edges) => new()
{
    Nodes = ids.Select(id => new OntologyNode { Id = id, RiskScore = 42 }).ToList(),
    Edges = edges.Select(edge => new OntologyEdge
    {
        SourceId = edge.source, TargetId = edge.target, Weight = edge.weight
    }).ToList()
};
static double Metric(MultiHopDossierGraph graph, string id, string key) =>
    Convert.ToDouble(graph.Nodes.Single(node => node.Id == id).Properties[key]);
static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var empty = Graph(Array.Empty<string>());
GraphAnalyticsEngine.ComputeCentralityAndRisk(empty);
var isolated = Graph(new[] { "A", "B", "C" });
GraphAnalyticsEngine.ComputeCentralityAndRisk(isolated);
Check(isolated.Nodes.All(n => Math.Abs(Metric(isolated, n.Id, "PageRankScore") - 100.0 / 3) < 1e-5), "isolated ranks");
Check(isolated.Nodes.All(n => Metric(isolated, n.Id, "BetweennessCentrality") == 0), "isolated betweenness");

var chain = Graph(new[] { "A", "B", "C" }, ("A", "B", 1), ("B", "C", 1));
GraphAnalyticsEngine.ComputeCentralityAndRisk(chain);
Check(Math.Abs(Metric(chain, "B", "BetweennessCentrality") - 0.5) < 1e-6, "directed chain betweenness");
Check(chain.Nodes.All(n => n.RiskScore == 42), "risk must remain unchanged");

var star = Graph(new[] { "C", "A", "B", "D" }, ("A", "C", 1), ("C", "A", 1),
    ("B", "C", 1), ("C", "B", 1), ("D", "C", 1), ("C", "D", 1));
GraphAnalyticsEngine.ComputeCentralityAndRisk(star);
Check(Math.Abs(Metric(star, "C", "BetweennessCentrality") - 1) < 1e-6, "star center betweenness");
Check(Metric(star, "C", "DegreeCentrality") == 1, "star center degree");

var cycle = Graph(new[] { "A", "B", "C" }, ("A", "B", 1), ("B", "C", 1), ("C", "A", 1));
GraphAnalyticsEngine.ComputeCentralityAndRisk(cycle);
Check(cycle.Nodes.All(n => Math.Abs(Metric(cycle, n.Id, "PageRankScore") - 100.0 / 3) < 1e-5), "cycle ranks");

var weighted = Graph(new[] { "A", "B", "C" }, ("A", "B", 9), ("A", "C", 1));
GraphAnalyticsEngine.ComputeCentralityAndRisk(weighted);
Check(Metric(weighted, "B", "PageRankScore") > Metric(weighted, "C", "PageRankScore"), "weighted rank");
var snapshot = weighted.Nodes.ToDictionary(n => n.Id, n => Metric(weighted, n.Id, "PageRankScore"));
GraphAnalyticsEngine.ComputeMatrixCentralityAndPageRank(weighted);
Check(weighted.Nodes.All(n => snapshot[n.Id] == Metric(weighted, n.Id, "PageRankScore")), "repeatability");
Console.WriteLine("PASS: empty, isolated, chain, star, cycle, weighted PageRank, risk isolation, repeatability");
