using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// Deterministic weighted modularity local-moving community detection (Louvain phase one).
/// Directed edges are symmetrized into an undirected strength graph; parallel strengths add.
/// No claims of wrongdoing are inferred from community membership.
/// </summary>
public static class GraphCommunityDetectionEngine
{
    public static GraphCommunityResult Analyze(MultiHopDossierGraph graph, int maxPasses = 50)
    {
        ArgumentNullException.ThrowIfNull(graph);
        if (maxPasses < 1 || maxPasses > 1000) throw new ArgumentOutOfRangeException(nameof(maxPasses));
        var nodes = (graph.Nodes ?? new List<OntologyNode>()).OrderBy(n => n.Id, StringComparer.Ordinal).ToArray();
        if (nodes.Any(n => string.IsNullOrWhiteSpace(n.Id)) ||
            nodes.Select(n => n.Id).Distinct(StringComparer.Ordinal).Count() != nodes.Length)
            throw new ArgumentException("Node IDs must be unique and non-empty.", nameof(graph));

        int n = nodes.Length;
        var lookup = nodes.Select((node, index) => (node.Id, index))
            .ToDictionary(x => x.Id, x => x.index, StringComparer.Ordinal);
        var adjacency = Enumerable.Range(0, n).Select(_ => new SortedDictionary<int, double>()).ToArray();
        foreach (var edge in graph.Edges ?? new List<OntologyEdge>())
        {
            if (!lookup.TryGetValue(edge.SourceId, out var u) ||
                !lookup.TryGetValue(edge.TargetId, out var v) || u == v ||
                !double.IsFinite(edge.Weight) || edge.Weight <= 0) continue;
            var next = adjacency[u].GetValueOrDefault(v) + edge.Weight;
            if (!double.IsFinite(next)) throw new ArgumentException("Edge weight sum overflow.", nameof(graph));
            adjacency[u][v] = next;
            adjacency[v][u] = next;
        }

        var degree = adjacency.Select(a => a.Values.Sum()).ToArray();
        double m2 = degree.Sum();
        var communities = Enumerable.Range(0, n).ToArray();
        double modularity = Modularity(communities, adjacency, degree, m2);
        int passes = 0;
        if (m2 > 0)
        {
            for (; passes < maxPasses; passes++)
            {
                bool changed = false;
                for (int u = 0; u < n; u++)
                {
                    if (degree[u] <= 0) continue;
                    var original = communities[u];
                    var best = original;
                    var bestQ = modularity;
                    foreach (var candidate in adjacency[u].Keys.Select(v => communities[v])
                                 .Append(original).Distinct().OrderBy(x => x))
                    {
                        if (candidate == original) continue;
                        communities[u] = candidate;
                        var q = Modularity(communities, adjacency, degree, m2);
                        if (q > bestQ + 1e-12)
                        {
                            bestQ = q;
                            best = candidate;
                        }
                    }
                    communities[u] = best;
                    if (best != original)
                    {
                        modularity = bestQ;
                        changed = true;
                    }
                }
                if (!changed) { passes++; break; }
            }
        }

        // Stable community IDs based on the smallest member ID, not iteration-dependent labels.
        var grouped = Enumerable.Range(0, n).GroupBy(i => communities[i])
            .Select(g => g.OrderBy(i => nodes[i].Id, StringComparer.Ordinal).ToArray())
            .OrderBy(g => nodes[g[0]].Id, StringComparer.Ordinal).ToArray();
        var assignments = new Dictionary<string, int>(StringComparer.Ordinal);
        var sizes = new Dictionary<int, int>();
        for (int c = 0; c < grouped.Length; c++)
        {
            sizes[c] = grouped[c].Length;
            foreach (var i in grouped[c]) assignments[nodes[i].Id] = c;
        }
        var bridges = new List<string>();
        for (int i = 0; i < n; i++)
        {
            int cross = adjacency[i].Keys.Count(j => assignments[nodes[j].Id] != assignments[nodes[i].Id]);
            var properties = nodes[i].Properties ??= new Dictionary<string, object>();
            properties["CommunityId"] = assignments[nodes[i].Id];
            properties["CommunitySize"] = sizes[assignments[nodes[i].Id]];
            properties["CrossCommunityDegree"] = cross;
            properties["CommunityDetectionVersion"] = "3.1.2-local-moving";
            if (cross > 0) bridges.Add(nodes[i].Id);
        }
        return new GraphCommunityResult(assignments, sizes, bridges, Math.Round(modularity, 8), passes,
            "Weighted undirected modularity local-moving (single level); directional strengths summed");
    }

    private static double Modularity(int[] membership, SortedDictionary<int, double>[] adjacency,
        double[] degree, double m2)
    {
        if (m2 == 0) return 0;
        var totals = new Dictionary<int, double>();
        var internalWeight = new Dictionary<int, double>();
        for (int u = 0; u < membership.Length; u++)
        {
            int c = membership[u];
            totals[c] = totals.GetValueOrDefault(c) + degree[u];
            foreach (var (v, w) in adjacency[u])
                if (membership[v] == c)
                    internalWeight[c] = internalWeight.GetValueOrDefault(c) + w;
        }
        return totals.Keys.Sum(c => internalWeight.GetValueOrDefault(c) / m2 - Math.Pow(totals[c] / m2, 2));
    }
}

public sealed record GraphCommunityResult(
    IReadOnlyDictionary<string, int> Assignments,
    IReadOnlyDictionary<int, int> CommunitySizes,
    IReadOnlyList<string> BridgeNodeIds,
    double Modularity,
    int Passes,
    string Method);
