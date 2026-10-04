using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// موتور تحلیلی محاسبات گراف سامانه دیده‌بان
/// پیاده‌سازی شاخص‌های مرکزیت شبکه (PageRank, Betweenness Centrality, Degree)
/// و الگوریتم‌های خوشه‌بندی جهت کشف سرشبکه‌ها و جریان‌های پولشویی/قاچاق
/// </summary>
public static class GraphAnalyticsEngine
{
    public static void ComputeCentralityAndRisk(MultiHopDossierGraph graph)
    {
        if (graph?.Nodes == null || graph.Nodes.Count == 0)
        {
            return;
        }

        var nodeIds = graph.Nodes.Select(n => n.Id).Distinct().ToList();
        var edges = graph.Edges ?? new List<OntologyEdge>();

        // ۱. ساخت ماتریس مجاورت جهت محاسبات سریع
        var outgoing = new Dictionary<string, List<(string Target, double Weight)>>();
        var incoming = new Dictionary<string, List<(string Source, double Weight)>>();
        var unweightedAdj = new Dictionary<string, HashSet<string>>();

        foreach (var id in nodeIds)
        {
            outgoing[id] = new List<(string, double)>();
            incoming[id] = new List<(string, double)>();
            unweightedAdj[id] = new HashSet<string>();
        }

        foreach (var edge in edges)
        {
            if (outgoing.ContainsKey(edge.SourceId) && outgoing.ContainsKey(edge.TargetId))
            {
                var w = edge.Weight <= 0 ? 1.0 : edge.Weight;
                outgoing[edge.SourceId].Add((edge.TargetId, w));
                incoming[edge.TargetId].Add((edge.SourceId, w));

                unweightedAdj[edge.SourceId].Add(edge.TargetId);
                unweightedAdj[edge.TargetId].Add(edge.SourceId);
            }
        }

        // ۲. محاسبه PageRank
        var pageRanks = ComputePageRank(nodeIds, outgoing, dampingFactor: 0.85, maxIterations: 40);

        // ۳. محاسبه Betweenness Centrality با استفاده از الگوریتم براندز (Ulrik Brandes)
        var betweenness = ComputeBetweennessCentrality(nodeIds, unweightedAdj);

        // ۴. کشف جوامع و خوشه‌های تبانی با الگوریتم مؤلفه‌های ماژولار
        var communities = DetectCommunities(nodeIds, unweightedAdj);

        // ۵. اعمال ضرایب محاسباتی به ویژگی‌های نودها و به‌‌روزرسانی رتبه ریسک
        foreach (var node in graph.Nodes)
        {
            var pr = pageRanks.GetValueOrDefault(node.Id, 0.0);
            var bc = betweenness.GetValueOrDefault(node.Id, 0.0);
            var deg = (outgoing[node.Id].Count + incoming[node.Id].Count);
            var cluster = communities.GetValueOrDefault(node.Id, 1);

            node.Properties["DegreeCentrality"] = deg;
            node.Properties["PageRank"] = Math.Round(pr, 4);
            node.Properties["BetweennessCentrality"] = Math.Round(bc, 4);
            node.Properties["CommunityId"] = cluster;

            // تشخیص سرشبکه پنهان (تراکنش شاید کم ولی بینابینی بالا و اتصال خوشه‌ای کلیدی)
            var isHiddenBridge = bc > 0.25 && deg < 6;
            if (isHiddenBridge)
            {
                node.Properties["IsHiddenBridge"] = true;
                node.RiskScore = Math.Min(99, Math.Max(node.RiskScore, 92));
            }
        }
    }

    private static Dictionary<string, double> ComputePageRank(
        List<string> nodeIds,
        Dictionary<string, List<(string Target, double Weight)>> outgoing,
        double dampingFactor,
        int maxIterations)
    {
        var n = nodeIds.Count;
        var ranks = nodeIds.ToDictionary(id => id, _ => 1.0 / n);
        var dampingValue = (1.0 - dampingFactor) / n;

        for (int iter = 0; iter < maxIterations; iter++)
        {
            var nextRanks = nodeIds.ToDictionary(id => id, _ => dampingValue);
            double danglingSum = 0;

            foreach (var id in nodeIds)
            {
                var outs = outgoing[id];
                if (outs.Count == 0)
                {
                    danglingSum += ranks[id];
                }
                else
                {
                    var totalWeight = outs.Sum(x => x.Weight);
                    if (totalWeight <= 0) totalWeight = outs.Count;

                    var share = (ranks[id] * dampingFactor);
                    foreach (var edge in outs)
                    {
                        var edgeShare = share * (edge.Weight / totalWeight);
                        nextRanks[edge.Target] += edgeShare;
                    }
                }
            }

            if (danglingSum > 0)
            {
                var extraPerNode = (dampingFactor * danglingSum) / n;
                foreach (var id in nodeIds)
                {
                    nextRanks[id] += extraPerNode;
                }
            }

            ranks = nextRanks;
        }

        return ranks;
    }

    private static Dictionary<string, double> ComputeBetweennessCentrality(
        List<string> nodeIds,
        Dictionary<string, HashSet<string>> adj)
    {
        var cb = nodeIds.ToDictionary(id => id, _ => 0.0);

        foreach (var s in nodeIds)
        {
            var stack = new Stack<string>();
            var predecessors = nodeIds.ToDictionary(id => id, _ => new List<string>());
            var sigma = nodeIds.ToDictionary(id => id, _ => 0.0);
            var dist = nodeIds.ToDictionary(id => id, _ => -1);
            var delta = nodeIds.ToDictionary(id => id, _ => 0.0);

            sigma[s] = 1.0;
            dist[s] = 0;

            var queue = new Queue<string>();
            queue.Enqueue(s);

            while (queue.Count > 0)
            {
                var v = queue.Dequeue();
                stack.Push(v);

                foreach (var w in adj[v])
                {
                    if (dist[w] < 0)
                    {
                        dist[w] = dist[v] + 1;
                        queue.Enqueue(w);
                    }

                    if (dist[w] == dist[v] + 1)
                    {
                        sigma[w] += sigma[v];
                        predecessors[w].Add(v);
                    }
                }
            }

            while (stack.Count > 0)
            {
                var w = stack.Pop();
                foreach (var v in predecessors[w])
                {
                    if (sigma[w] > 0)
                    {
                        delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
                    }
                }

                if (w != s)
                {
                    cb[w] += delta[w];
                }
            }
        }

        // نرمال‌سازی مقدار مرکزیت بینابینی برای گراف‌های غیرجهت‌دار
        var n = nodeIds.Count;
        if (n > 2)
        {
            var factor = 1.0 / ((n - 1) * (n - 2));
            foreach (var id in nodeIds)
            {
                cb[id] = Math.Round(cb[id] * factor, 4);
            }
        }

        return cb;
    }

    private static Dictionary<string, int> DetectCommunities(
        List<string> nodeIds,
        Dictionary<string, HashSet<string>> adj)
    {
        var visited = new HashSet<string>();
        var communities = new Dictionary<string, int>();
        int clusterCounter = 1;

        foreach (var node in nodeIds)
        {
            if (!visited.Contains(node))
            {
                var queue = new Queue<string>();
                queue.Enqueue(node);
                visited.Add(node);

                while (queue.Count > 0)
                {
                    var curr = queue.Dequeue();
                    communities[curr] = clusterCounter;

                    foreach (var neighbor in adj[curr])
                    {
                        if (!visited.Contains(neighbor))
                        {
                            visited.Add(neighbor);
                            queue.Enqueue(neighbor);
                        }
                    }
                }

                clusterCounter++;
            }
        }

        return communities;
    }
}