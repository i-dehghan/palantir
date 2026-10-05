using Dideban.Api.Domain.Ontology;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using static Dideban.Api.Services.PalantirLinkTraversalEngine;

namespace Dideban.Api.Services;

public interface IPalantirLinkTraversalEngine
{
    Task<MultiHopDossierGraph> TraverseNetworkAsync(string nationalId, int maxDepth = 2);
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
        var graph = new MultiHopDossierGraph
        {
            RootEntityId = $"PERSON_{nationalId}",
            ExploredDepth = maxDepth
        };

        var nodeMap = new Dictionary<string, OntologyNode>();
        var edgeSet = new HashSet<string>();

        var rootNode = new OntologyNode
        {
            Id = $"PERSON_{nationalId}",
            Type = EntityType.Person,
            DisplayLabel = $"سوژه تحت رصد: {nationalId}",
            RiskScore = 95,
            Properties = new() { { "NationalId", nationalId }, { "Watchlist", true } }
        };
        nodeMap[rootNode.Id] = rootNode;

        var bankAccounts = await _context.Database.SqlQueryRaw<string>(@"
            SELECT DISTINCT source_account 
            FROM bank_transactions 
            WHERE customer_national_id = {0}
        ", nationalId).ToListAsync();

        var phoneLines = await _context.Database.SqlQueryRaw<string>(@"
            SELECT DISTINCT caller_msisdn 
            FROM telecom_cdrs 
            WHERE caller_national_id = {0}
            LIMIT 5
        ", nationalId).ToListAsync();

        var customsDocs = await _context.Database.SqlQueryRaw<string>(@"
            SELECT DISTINCT order_reg_number 
            FROM ntsw_orders 
            WHERE importer_national_id = {0}
            LIMIT 5
        ", nationalId).ToListAsync();

        foreach (var acc in bankAccounts)
        {
            var accId = $"ACC_{acc}";
            nodeMap[accId] = new OntologyNode
            {
                Id = accId,
                Type = EntityType.BankAccount,
                DisplayLabel = $"حساب: {acc}",
                RiskScore = 80,
                Properties = new() { { "AccountNumber", acc } }
            };
            AddEdge(graph, edgeSet, rootNode.Id, accId, "OWNS_BANK_ACCOUNT");
        }

        foreach (var phone in phoneLines)
        {
            var phoneId = $"TEL_{phone}";
            nodeMap[phoneId] = new OntologyNode
            {
                Id = phoneId,
                Type = EntityType.TelecomEndpoint,
                DisplayLabel = $"سیم‌کارت: {phone}",
                RiskScore = 75,
                Properties = new() { { "MSISDN", phone } }
            };
            AddEdge(graph, edgeSet, rootNode.Id, phoneId, "REGISTERED_SUBSCRIBER");
        }

        foreach (var doc in customsDocs)
        {
            var docId = $"DOC_{doc}";
            nodeMap[docId] = new OntologyNode
            {
                Id = docId,
                Type = EntityType.CustomsDocument,
                DisplayLabel = $"سند واردات: {doc}",
                RiskScore = 85,
                Properties = new() { { "OrderRegNumber", doc } }
            };
            AddEdge(graph, edgeSet, rootNode.Id, docId, "DECLARED_IMPORT");
        }

        if (maxDepth >= 2)
        {
            if (bankAccounts.Any())
            {
                var accList = string.Join("','", bankAccounts);
                var transfers = await _context.Database.SqlQueryRaw<TransferHopRecord>($@"
                    SELECT source_account AS SourceAcc, dest_account AS DestAcc, amount_irr AS Amount
                    FROM bank_transactions 
                    WHERE source_account IN ('{accList}')
                    LIMIT 10
                ").ToListAsync();

                foreach (var tx in transfers)
                {
                    var destId = $"MULE_{tx.DestAcc}";
                    if (!nodeMap.ContainsKey(destId))
                    {
                        nodeMap[destId] = new OntologyNode
                        {
                            Id = destId,
                            Type = EntityType.BankAccount,
                            DisplayLabel = $"واسط/قاطر: {tx.DestAcc}",
                            RiskScore = 90,
                            Properties = new() { { "AccountNumber", tx.DestAcc }, { "Role", "Layering Entity" } }
                        };
                    }
                    AddEdge(graph, edgeSet, $"ACC_{tx.SourceAcc}", destId, "TRANSFERRED_FUNDS", tx.Amount / 10.0);
                }
            }
        }

        graph.Nodes = nodeMap.Values.ToList();

        // اجرای محاسبات ماتریسی گراف در بک‌اند .NET
        GraphAnalyticsEngine.ComputeMatrixCentralityAndPageRank(graph);
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
        var graph = new MultiHopDossierGraph { RootEntityId = nodeId, ExploredDepth = 1 };
        var nodeMap = new Dictionary<string, OntologyNode>();
        var edgeSet = new HashSet<string>();

        graph.Nodes = nodeMap.Values.ToList();
        return graph;
    }

    public async Task<PathfindingResultDto> FindShortestIntermediaryPathAsync(string sourceId, string targetId)
    {
        return new PathfindingResultDto { SourceId = sourceId, TargetId = targetId, PathExists = true };
    }

    private class TransferHopRecord { public string SourceAcc { get; set; } = ""; public string DestAcc { get; set; } = ""; public long Amount { get; set; } }

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

