using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

public static class GraphAnalyticsEngine
{
    public static void ComputeCentralityAndRisk(MultiHopDossierGraph graph)
    {
        var degreeMap = new Dictionary<string, int>();

        // محاسبه Degree Centrality (تعداد اتصالات مستقیم هر گره)
        foreach (var node in graph.Nodes)
        {
            degreeMap[node.Id] = 0;
        }

        foreach (var edge in graph.Edges)
        {
            if (degreeMap.ContainsKey(edge.SourceId)) degreeMap[edge.SourceId]++;
            if (degreeMap.ContainsKey(edge.TargetId)) degreeMap[edge.TargetId]++;
        }

        int maxDegree = degreeMap.Values.DefaultIfEmpty(1).Max();

        // وزن‌دهی به گره‌ها بر اساس مرکزیت و تنظیم ابعاد بصری
        foreach (var node in graph.Nodes)
        {
            int deg = degreeMap[node.Id];
            double centralityScore = (double)deg / Math.Max(1, maxDegree);

            node.Properties["DegreeCentrality"] = deg;
            node.Properties["CentralityScore"] = Math.Round(centralityScore * 100, 1);

            // اگر گره پل ارتباطی پرتکرار باشد، ضریب ریسک تصاعدی افزایش می‌یابد
            if (deg >= 4 && node.Type != EntityType.Person)
            {
                node.RiskScore = Math.Min(99, node.RiskScore + 15);
                node.Properties["HubAlert"] = "کانون تجمیع و انتقال مشکوک (Key Hub Entity)";
            }
        }
    }
}