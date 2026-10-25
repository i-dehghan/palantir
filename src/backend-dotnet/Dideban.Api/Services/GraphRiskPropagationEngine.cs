using Dideban.Api.Domain.Ontology;

namespace Dideban.Api.Services;

/// <summary>
/// Bounded exploratory network-signal propagation. Not a probability, accusation,
/// or independent assessment of an individual. Never mutates the input graph.
/// </summary>
public static class GraphRiskPropagationEngine
{
    public sealed record Settings(int MaxHops = 3, double Decay = 0.5, double InfluenceCap = 25.0)
    {
        public void Validate()
        {
            if (MaxHops is < 1 or > 6) throw new ArgumentOutOfRangeException(nameof(MaxHops));
            if (!double.IsFinite(Decay) || Decay <= 0 || Decay >= 1)
                throw new ArgumentOutOfRangeException(nameof(Decay));
            if (!double.IsFinite(InfluenceCap) || InfluenceCap < 0 || InfluenceCap > 100)
                throw new ArgumentOutOfRangeException(nameof(InfluenceCap));
        }
    }

    public sealed record SourceContribution(string SourceId, double SourceScore,
        double PathStrength, int Hops, IReadOnlyList<string> Path, double Contribution);
    public sealed record NodeResult(string NodeId, double BaseScore, double NetworkInfluence,
        double CombinedIndex, IReadOnlyList<SourceContribution> Sources);
    public sealed record Result(string Version, Settings Configuration, IReadOnlyList<NodeResult> Nodes);

    private sealed record Arc(int Target, double Weight);
    private sealed record Candidate(double Strength, int Hops, int[] Path);

    public static Result Propagate(MultiHopDossierGraph graph,
        GraphRiskScoringEngine.Result baseline, Settings? settings = null)
    {
        ArgumentNullException.ThrowIfNull(graph);
        ArgumentNullException.ThrowIfNull(baseline);
        settings ??= new Settings();
        settings.Validate();

        var nodes = (graph.Nodes ?? new List<OntologyNode>())
            .OrderBy(n => n.Id, StringComparer.Ordinal).ToArray();
        if (nodes.Any(n => n is null || string.IsNullOrWhiteSpace(n.Id)) ||
            nodes.Select(n => n.Id).Distinct(StringComparer.Ordinal).Count() != nodes.Length)
            throw new ArgumentException("Node IDs must be unique and non-empty.", nameof(graph));
        var scores = baseline.Nodes.ToDictionary(n => n.NodeId, n => n.PriorityScore, StringComparer.Ordinal);
        if (scores.Count != nodes.Length || nodes.Any(n => !scores.ContainsKey(n.Id)) ||
            scores.Values.Any(s => !double.IsFinite(s) || s < 0 || s > 100))
            throw new ArgumentException("Baseline must have one bounded score for every node.", nameof(baseline));
        if (nodes.Length == 0) return new Result("3.1.6.2", settings, Array.Empty<NodeResult>());

        var index = nodes.Select((n, i) => (n.Id, i))
            .ToDictionary(x => x.Id, x => x.i, StringComparer.Ordinal);
        // Undirected, aggregated links; duplicate and reverse edges do not amplify influence.
        var weights = new Dictionary<(int, int), double>();
        foreach (var edge in graph.Edges ?? new List<OntologyEdge>())
        {
            if (edge is null || !double.IsFinite(edge.Weight) || edge.Weight <= 0 ||
                !index.TryGetValue(edge.SourceId, out var a) ||
                !index.TryGetValue(edge.TargetId, out var b) || a == b) continue;
            var key = (Math.Min(a, b), Math.Max(a, b));
            weights[key] = Math.Max(weights.GetValueOrDefault(key), edge.Weight);
        }
        var adjacency = Enumerable.Range(0, nodes.Length)
            .Select(_ => new List<Arc>()).ToArray();
        foreach (var ((a, b), weight) in weights)
        {
            adjacency[a].Add(new Arc(b, weight));
            adjacency[b].Add(new Arc(a, weight));
        }
        foreach (var list in adjacency) list.Sort((a, b) => a.Target.CompareTo(b.Target));
        // Normalize by the strongest incident edge, preserving relative edge strength.
        var maximum = adjacency.Select(a => a.Count == 0 ? 1.0 : a.Max(e => e.Weight)).ToArray();
        var contributions = Enumerable.Range(0, nodes.Length)
            .Select(_ => new List<SourceContribution>()).ToArray();

        for (var source = 0; source < nodes.Length; source++)
        {
            var sourceScore = scores[nodes[source].Id];
            if (sourceScore <= 0) continue;
            var best = new Candidate?[nodes.Length];
            var visited = new bool[nodes.Length];
            visited[source] = true;
            var path = new List<int> { source };
            void Visit(int current, int hops, double strength)
            {
                if (hops >= settings.MaxHops) return;
                foreach (var arc in adjacency[current])
                {
                    if (visited[arc.Target]) continue;
                    var next = strength * settings.Decay * (arc.Weight / maximum[current]);
                    if (next <= 0) continue;
                    path.Add(arc.Target);
                    visited[arc.Target] = true;
                    var candidate = new Candidate(next, hops + 1, path.ToArray());
                    var prior = best[arc.Target];
                    // Stable tie-break: higher strength, then fewer hops, then lexicographic path.
                    if (prior is null || candidate.Strength > prior.Strength + 1e-12 ||
                        (Math.Abs(candidate.Strength - prior.Strength) <= 1e-12 &&
                         (candidate.Hops < prior.Hops ||
                          (candidate.Hops == prior.Hops && ComparePaths(candidate.Path, prior.Path) < 0))))
                        best[arc.Target] = candidate;
                    Visit(arc.Target, hops + 1, next);
                    visited[arc.Target] = false;
                    path.RemoveAt(path.Count - 1);
                }
            }
            Visit(source, 0, 1);
            for (var target = 0; target < nodes.Length; target++)
            {
                if (target == source || best[target] is not { } candidate) continue;
                contributions[target].Add(new SourceContribution(nodes[source].Id,
                    sourceScore, Math.Round(candidate.Strength, 8), candidate.Hops,
                    candidate.Path.Select(i => nodes[i].Id).ToArray(),
                    Math.Round(sourceScore * candidate.Strength, 8)));
            }
        }

        var results = new List<NodeResult>(nodes.Length);
        for (var i = 0; i < nodes.Length; i++)
        {
            var sources = contributions[i].OrderByDescending(s => s.Contribution)
                .ThenBy(s => s.SourceId, StringComparer.Ordinal).ToArray();
            // Saturating, bounded combination: a single hub cannot cause unbounded growth.
            var raw = sources.Sum(s => s.Contribution);
            var influence = Math.Round(settings.InfluenceCap * (1 - Math.Exp(-raw / 100.0)), 6);
            var baseScore = scores[nodes[i].Id];
            results.Add(new NodeResult(nodes[i].Id, baseScore, influence,
                Math.Round(Math.Min(100, baseScore + (100 - baseScore) * influence / 100), 6), sources));
        }
        return new Result("3.1.6.2", settings, results);
    }

    private static int ComparePaths(int[] a, int[] b)
    {
        for (var i = 0; i < Math.Min(a.Length, b.Length); i++)
        {
            var comparison = a[i].CompareTo(b[i]);
            if (comparison != 0) return comparison;
        }
        return a.Length.CompareTo(b.Length);
    }
}
