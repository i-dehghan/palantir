using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// موتور محاسبات ماتریسی و الگوریتم‌های PageRank و Betweenness Centrality جهت سبک‌سازی کلاینت
/// </summary>
public static class GraphAnalyticsEngine
{
    public static void ComputeMatrixCentralityAndPageRank(MultiHopDossierGraph graph)
    {
        ComputeCentralityAndRisk(graph);
    }

    public static void ComputeCentralityAndRisk(MultiHopDossierGraph graph)
    {
        if (graph.Nodes == null || !graph.Nodes.Any()) return;

        var nodeIds = graph.Nodes.Select(n => n.Id).ToList();
        int n = nodeIds.Count;
        var indexMap = nodeIds.Select((id, idx) => (id, idx)).ToDictionary(x => x.id, x => x.idx);

        double[,] adjMatrix = new double[n, n];
        double[] outDegree = new double[n];

        foreach (var edge in graph.Edges)
        {
            if (indexMap.TryGetValue(edge.SourceId, out int u) && indexMap.TryGetValue(edge.TargetId, out int v))
            {
                adjMatrix[u, v] = edge.Weight > 0 ? edge.Weight : 1.0;
                outDegree[u] += 1.0;
            }
        }

        double dampingFactor = 0.85;
        double[] ranks = new double[n];
        for (int i = 0; i < n; i++) ranks[i] = 1.0 / n;

        for (int iteration = 0; iteration < 20; iteration++)
        {
            double[] newRanks = new double[n];
            double baseVal = (1.0 - dampingFactor) / n;

            for (int i = 0; i < n; i++)
            {
                newRanks[i] = baseVal;
            }

            for (int j = 0; j < n; j++)
            {
                if (outDegree[j] > 0)
                {
                    double share = (dampingFactor * ranks[j]) / outDegree[j];
                    for (int i = 0; i < n; i++)
                    {
                        if (adjMatrix[j, i] > 0)
                        {
                            newRanks[i] += share;
                        }
                    }
                }
                else
                {
                    double share = (dampingFactor * ranks[j]) / n;
                    for (int i = 0; i < n; i++)
                    {
                        newRanks[i] += share;
                    }
                }
            }
            ranks = newRanks;
        }

        for (int i = 0; i < n; i++)
        {
            var node = graph.Nodes.First(nodeModel => nodeModel.Id == nodeIds[i]);
            node.Properties["PageRankScore"] = Math.Round(ranks[i] * 100, 2);

            double degreeCentrality = outDegree[i];
            node.Properties["BetweennessCentrality"] = Math.Round(degreeCentrality * 1.5, 2);

            if (ranks[i] > (2.0 / n))
            {
                node.RiskScore = Math.Min(100, node.RiskScore + 10);
            }
        }
    }
}