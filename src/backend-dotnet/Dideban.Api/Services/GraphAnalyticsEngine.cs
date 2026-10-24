using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// Deterministic directed graph analytics. Centrality describes topology, not criminal risk.
/// Parallel edge weights are summed; invalid, non-positive and self-loop edges are ignored.
/// </summary>
public static class GraphAnalyticsEngine
{
    private const double Damping = 0.85;
    private const double Tolerance = 1e-12;
    private const int MaxIterations = 200;

    public static void ComputeMatrixCentralityAndPageRank(MultiHopDossierGraph graph) =>
        ComputeCentralityAndRisk(graph);

    // Historical API name retained for compatibility; this method does NOT modify RiskScore.
    public static void ComputeCentralityAndRisk(MultiHopDossierGraph graph)
    {
        ArgumentNullException.ThrowIfNull(graph);
        if (graph.Nodes is null || graph.Nodes.Count == 0) return;

        var nodes = graph.Nodes.OrderBy(node => node.Id, StringComparer.Ordinal).ToArray();
        var count = nodes.Length;
        if (nodes.Any(node => string.IsNullOrWhiteSpace(node.Id)) ||
            nodes.Select(node => node.Id).Distinct(StringComparer.Ordinal).Count() != count)
            throw new ArgumentException("Graph node IDs must be unique and non-empty.", nameof(graph));

        var indices = nodes.Select((node, index) => (node.Id, index))
            .ToDictionary(item => item.Id, item => item.index, StringComparer.Ordinal);
        var adjacency = Enumerable.Range(0, count)
            .Select(_ => new SortedDictionary<int, double>()).ToArray();

        foreach (var edge in graph.Edges ?? new List<OntologyEdge>())
        {
            if (!indices.TryGetValue(edge.SourceId, out var source) ||
                !indices.TryGetValue(edge.TargetId, out var target) || source == target ||
                !double.IsFinite(edge.Weight) || edge.Weight <= 0) continue;
            adjacency[source][target] = adjacency[source].GetValueOrDefault(target) + edge.Weight;
        }

        var outgoingWeight = adjacency.Select(edges => edges.Values.Sum()).ToArray();
        var ranks = Enumerable.Repeat(1.0 / count, count).ToArray();
        for (var iteration = 0; iteration < MaxIterations; iteration++)
        {
            var danglingMass = Enumerable.Range(0, count)
                .Where(index => outgoingWeight[index] == 0).Sum(index => ranks[index]);
            var next = Enumerable.Repeat((1 - Damping + Damping * danglingMass) / count, count).ToArray();
            for (var source = 0; source < count; source++)
            {
                if (outgoingWeight[source] <= 0) continue;
                foreach (var (target, weight) in adjacency[source])
                    next[target] += Damping * ranks[source] * weight / outgoingWeight[source];
            }
            var delta = Enumerable.Range(0, count).Sum(index => Math.Abs(next[index] - ranks[index]));
            ranks = next;
            if (delta < Tolerance) break;
        }

        // Directed, unweighted shortest-path Brandes betweenness; edge weights are strengths,
        // not distances. Weighted shortest paths require an explicit distance contract.
        var betweenness = new double[count];
        for (var source = 0; source < count; source++)
        {
            var predecessors = Enumerable.Range(0, count).Select(_ => new List<int>()).ToArray();
            var distances = Enumerable.Repeat(-1, count).ToArray();
            var paths = new double[count];
            var order = new Stack<int>();
            var queue = new Queue<int>();
            distances[source] = 0;
            paths[source] = 1;
            queue.Enqueue(source);
            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                order.Push(current);
                foreach (var target in adjacency[current].Keys)
                {
                    if (distances[target] < 0)
                    {
                        distances[target] = distances[current] + 1;
                        queue.Enqueue(target);
                    }
                    if (distances[target] == distances[current] + 1)
                    {
                        paths[target] += paths[current];
                        predecessors[target].Add(current);
                    }
                }
            }
            var dependencies = new double[count];
            while (order.Count > 0)
            {
                var node = order.Pop();
                foreach (var predecessor in predecessors[node])
                    dependencies[predecessor] += paths[predecessor] / paths[node] * (1 + dependencies[node]);
                if (node != source) betweenness[node] += dependencies[node];
            }
        }

        var betweenNormalizer = count > 2 ? (count - 1.0) * (count - 2.0) : 1.0;
        var degreeNormalizer = count > 1 ? count - 1.0 : 1.0;
        for (var index = 0; index < count; index++)
        {
            var properties = nodes[index].Properties ??= new Dictionary<string, object>();
            properties["PageRankScore"] = Math.Round(ranks[index] * 100, 6);
            properties["BetweennessCentrality"] = Math.Round(betweenness[index] / betweenNormalizer, 6);
            properties["DegreeCentrality"] = Math.Round(adjacency[index].Count / degreeNormalizer, 6);
            properties["OutDegree"] = adjacency[index].Count;
            properties["GraphAnalyticsVersion"] = "3.1.1";
        }
    }
}
