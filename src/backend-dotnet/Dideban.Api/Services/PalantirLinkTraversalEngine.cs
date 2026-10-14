using Dideban.Api.Domain.Ontology;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using static Dideban.Api.Services.PalantirLinkTraversalEngine;

namespace Dideban.Api.Services;

public interface IPalantirLinkTraversalEngine
{
    Task<MultiHopDossierGraph> TraverseNetworkAsync(string nationalId, int maxDepth = 2);
    Task<MultiHopDossierGraph> TraverseMultiEntityNetworkAsync(List<string> nationalIds, int maxDepth = 2);
    Task<MultiHopDossierGraph> ExpandNodeAsync(string nodeId);
    Task<PathfindingResultDto> FindShortestIntermediaryPathAsync(string sourceId, string targetId);
}

public class PalantirLinkTraversalEngine : IPalantirLinkTraversalEngine
{
    private readonly AppDbContext _context;

    public PalantirLinkTraversalEngine(AppDbContext context)
    {
        _context = context;
    }

    public async Task<MultiHopDossierGraph> TraverseNetworkAsync(string nationalId, int maxDepth = 2)
    {
        return await TraverseMultiEntityNetworkAsync(new List<string> { nationalId }, maxDepth);
    }

    public async Task<MultiHopDossierGraph> TraverseMultiEntityNetworkAsync(List<string> nationalIds, int maxDepth = 2)
    {
        var cleanIds = nationalIds
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct()
            .ToList();

        var primaryId = cleanIds.FirstOrDefault() ?? "0000000000";

        var graph = new MultiHopDossierGraph
        {
            RootEntityId = $"PERSON_{primaryId}",
            ExploredDepth = maxDepth
        };

        var nodeMap = new Dictionary<string, OntologyNode>();
        var edgeSet = new HashSet<string>();

        // ایجاد گره برای تمامی سوژه‌های واردشده
        foreach (var nid in cleanIds)
        {
            var pId = $"PERSON_{nid}";
            nodeMap[pId] = new OntologyNode
            {
                Id = pId,
                Type = EntityType.Person,
                DisplayLabel = $"سوژه تحت رصد: {nid}",
                RiskScore = 96,
                Properties = new() { { "NationalId", nid }, { "Watchlist", true } }
            };
        }

        // واکشی حساب‌ها و اسناد برای هرکدام از سوژه‌ها
        foreach (var nid in cleanIds)
        {
            var pId = $"PERSON_{nid}";

            var bankAccounts = await _context.Database.SqlQueryRaw<string>(@"
                SELECT DISTINCT source_account 
                FROM bank_transactions 
                WHERE customer_national_id = {0}
            ", nid).ToListAsync();

            var customsDocs = await _context.Database.SqlQueryRaw<string>(@"
                SELECT DISTINCT order_reg_number 
                FROM ntsw_orders 
                WHERE importer_national_id = {0}
                LIMIT 6
            ", nid).ToListAsync();

            foreach (var acc in bankAccounts)
            {
                var accId = $"ACC_{acc}";
                if (!nodeMap.ContainsKey(accId))
                {
                    nodeMap[accId] = new OntologyNode
                    {
                        Id = accId,
                        Type = EntityType.BankAccount,
                        DisplayLabel = $"حساب: {acc}",
                        RiskScore = 85,
                        Properties = new() { { "AccountNumber", acc } }
                    };
                }
                AddEdge(graph, edgeSet, pId, accId, "OWNS_BANK_ACCOUNT");
            }

            foreach (var doc in customsDocs)
            {
                var docId = $"DOC_{doc}";
                if (!nodeMap.ContainsKey(docId))
                {
                    nodeMap[docId] = new OntologyNode
                    {
                        Id = docId,
                        Type = EntityType.CustomsDocument,
                        DisplayLabel = $"سند واردات: {doc}",
                        RiskScore = 88,
                        Properties = new() { { "OrderRegNumber", doc } }
                    };
                }
                AddEdge(graph, edgeSet, pId, docId, "DECLARED_IMPORT");
            }
        }

        // اگر چند سوژه بررسی می‌شود، حساب‌ها یا اسناد مشترک را به عنوان پل ارتباطی پررنگ کن
        graph.Nodes = nodeMap.Values.ToList();
        GraphAnalyticsEngine.ComputeCentralityAndRisk(graph);
        return graph;
    }

    private void AddEdge(MultiHopDossierGraph g, HashSet<string> set, string src, string tgt, string pred, double weight = 1.0)
    {
        var key = $"{src}->{tgt}:{pred}";
        if (!set.Contains(key))
        {
            set.Add(key);
            g.Edges.Add(new OntologyEdge
            {
                SourceId = src,
                TargetId = tgt,
                Predicate = pred,
                Weight = weight
            });
        }
    }

    public async Task<MultiHopDossierGraph> ExpandNodeAsync(string nodeId)
    {
        return new MultiHopDossierGraph { RootEntityId = nodeId, ExploredDepth = 1 };
    }

    public async Task<PathfindingResultDto> FindShortestIntermediaryPathAsync(string sourceId, string targetId)
    {
        return new PathfindingResultDto { SourceId = sourceId, TargetId = targetId, PathExists = true };
    }

    public class PathfindingResultDto
    {
        public string SourceId { get; set; } = string.Empty;
        public string TargetId { get; set; } = string.Empty;
        public bool PathExists { get; set; }
        public List<string> PathNodeIds { get; set; } = new();
        public List<OntologyEdge> PathEdges { get; set; } = new();
        public string NarrativeSummary { get; set; } = string.Empty;
    }
}