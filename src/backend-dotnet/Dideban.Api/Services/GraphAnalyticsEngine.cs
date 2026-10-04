using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

public static class GraphAnalyticsEngine
{
    private const double DampingFactor = 0.85;
    private const int MaxPageRankIterations = 30;
    private const double PageRankTolerance = 1e-4;

    /// <summary>
    /// اجرای یکپارچه محاسبات Betweenness Centrality و PageRank و تزریق مقادیر به نودهای گراف
    /// </summary>
    public static void ComputeCentralityAndRisk(MultiHopDossierGraph graph)
    {
        if (graph?.Nodes == null || !graph.Nodes.Any()) return;

        var nodes = graph.Nodes;
        var edges = graph.Edges ?? new List<OntologyEdge>();

        // ۱. ساخت ماتریس مجاورت گراف به تفکیک همسایگان ورودی و خروجی
        var adjOut = new Dictionary<string, List<string>>();
        var adjIn = new Dictionary<string, List<string>>();
        var neighborsUndirected = new Dictionary<string, List<string>>();

        foreach (var node in nodes)
        {
            adjOut[node.Id] = new List<string>();
            adjIn[node.Id] = new List<string>();
            neighborsUndirected[node.Id] = new List<string>();
        }

        foreach (var edge in edges)
        {
            if (adjOut.ContainsKey(edge.SourceId) && adjOut.ContainsKey(edge.TargetId) && edge.SourceId != edge.TargetId)
            {
                adjOut[edge.SourceId].Add(edge.TargetId);
                adjIn[edge.TargetId].Add(edge.SourceId);

                if (!neighborsUndirected[edge.SourceId].Contains(edge.TargetId))
                    neighborsUndirected[edge.SourceId].Add(edge.TargetId);

                if (!neighborsUndirected[edge.TargetId].Contains(edge.SourceId))
                    neighborsUndirected[edge.TargetId].Add(edge.SourceId);
            }
        }

        // ۲. محاسبه PageRank با الگوریتم تکرار توانی (Power Iteration)
        var pageRanks = ComputePageRank(nodes.Select(n => n.Id).ToList(), adjOut, adjIn);

        // ۳. محاسبه Betweenness Centrality با الگوریتم سریع Brandes
        var betweenness = ComputeBetweennessCentralityBrandes(nodes.Select(n => n.Id).ToList(), neighborsUndirected);

        // ۴. نگاشت نتایج و نرمال‌سازی در Properties نودها
        double maxBetweenness = betweenness.Values.Any() ? betweenness.Values.Max() : 0.0;
        double maxPageRank = pageRanks.Values.Any() ? pageRanks.Values.Max() : 0.0;

        foreach (var node in nodes)
        {
            double rawBc = betweenness.GetValueOrDefault(node.Id, 0.0);
            double rawPr = pageRanks.GetValueOrDefault(node.Id, 0.0);

            double normBc = maxBetweenness > 0 ? (rawBc / maxBetweenness) : 0.0;
            double normPr = maxPageRank > 0 ? (rawPr / maxPageRank) : 0.0;

            // محاسبه ضریب اهمیت واسطه‌گری (پل ارتباطی تخلف)
            node.Properties["BetweennessCentrality"] = Math.Round(rawBc, 4);
            node.Properties["NormalizedBetweenness"] = Math.Round(normBc, 4);
            node.Properties["PageRank"] = Math.Round(rawPr, 5);
            node.Properties["IsCriticalBridge"] = normBc > 0.45;

            // به‌روزرسانی ضریب ریسک نود بر پایه جایگاه توپولوژیک در شبکه
            if (node.RiskScore > 0)
            {
                double structuralRiskWeight = (normBc * 0.5) + (normPr * 0.5);
                double adjustedRisk = (node.RiskScore * 0.7) + (structuralRiskWeight * 30.0);
                node.RiskScore = Math.Min(100, (int)Math.Round(adjustedRisk));
            }
        }
    }

    /// <summary>
    /// پیاده‌سازی الگوریتم PageRank با در نظر گرفتن Damping Factor و گره‌های بن‌بست (Dangling Nodes)
    /// </summary>
    private static Dictionary<string, double> ComputePageRank(
        List<string> nodeIds,
        Dictionary<string, List<string>> adjOut,
        Dictionary<string, List<string>> adjIn)
    {
        int n = nodeIds.Count;
        var ranks = new Dictionary<string, double>();
        if (n == 0) return ranks;

        double initialRank = 1.0 / n;
        foreach (var id in nodeIds)
        {
            ranks[id] = initialRank;
        }

        for (int iter = 0; iter < MaxPageRankIterations; iter++)
        {
            var nextRanks = new Dictionary<string, double>();
            double danglingSum = 0.0;

            // تجمیع امتیاز نودهایی که هیچ خروجی ندارند
            foreach (var id in nodeIds)
            {
                if (adjOut[id].Count == 0)
                {
                    danglingSum += ranks[id];
                }
            }

            double baseScore = (1.0 - DampingFactor + (DampingFactor * danglingSum)) / n;
            double maxDiff = 0.0;

            foreach (var id in nodeIds)
            {
                double incomingSum = 0.0;
                foreach (var inNeighbor in adjIn[id])
                {
                    int outDegree = adjOut[inNeighbor].Count;
                    if (outDegree > 0)
                    {
                        incomingSum += ranks[inNeighbor] / outDegree;
                    }
                }

                double newRank = baseScore + (DampingFactor * incomingSum);
                nextRanks[id] = newRank;

                double diff = Math.Abs(newRank - ranks[id]);
                if (diff > maxDiff) maxDiff = diff;
            }

            ranks = nextRanks;
            if (maxDiff < PageRankTolerance) break;
        }

        return ranks;
    }

    /// <summary>
    /// پیاده‌سازی الگوریتم Brandes برای Betweenness Centrality روی گراف بدون جهت با پیچیدگی O(V*E)
    /// </summary>
    private static Dictionary<string, double> ComputeBetweennessCentralityBrandes(
        List<string> nodeIds,
        Dictionary<string, List<string>> neighbors)
    {
        var cb = new Dictionary<string, double>();
        foreach (var v in nodeIds) cb[v] = 0.0;

        foreach (var s in nodeIds)
        {
            var stack = new Stack<string>();
            var p = new Dictionary<string, List<string>>();
            var sigma = new Dictionary<string, double>();
            var d = new Dictionary<string, int>();
            var delta = new Dictionary<string, double>();

            foreach (var w in nodeIds)
            {
                p[w] = new List<string>();
                sigma[w] = 0.0;
                d[w] = -1;
                delta[w] = 0.0;
            }

            sigma[s] = 1.0;
            d[s] = 0;

            var queue = new Queue<string>();
            queue.Enqueue(s);

            // گام ۱: پیمایش سطح‌اول (BFS)
            while (queue.Count > 0)
            {
                var v = queue.Dequeue();
                stack.Push(v);

                foreach (var w in neighbors[v])
                {
                    // کشف اولیه نود w
                    if (d[w] < 0)
                    {
                        d[w] = d[v] + 1;
                        queue.Enqueue(w);
                    }

                    // آیا کوتاه‌ترین مسیر از طریق v می‌‌گذرد؟
                    if (d[w] == d[v] + 1)
                    {
                        sigma[w] += sigma[v];
                        p[w].Add(v);
                    }
                }
            }

            // گام ۲: انباشت معکوس وابستگی‌ها (Back-propagation)
            while (stack.Count > 0)
            {
                var w = stack.Pop();
                foreach (var v in p[w])
                {
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
                }

                if (w != s)
                {
                    cb[w] += delta[w];
                }
            }
        }

        // برای گراف بدون جهت مقادیر دو بار شمرده می‌شوند، پس بر ۲ تقسیم می‌شوند
        foreach (var v in nodeIds)
        {
            cb[v] = cb[v] / 2.0;
        }

        return cb;
    }
}