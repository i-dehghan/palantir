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

        // گره مبنا: پرونده سوژه نظارتی
        var rootNode = new OntologyNode
        {
            Id = $"PERSON_{nationalId}",
            Type = EntityType.Person,
            DisplayLabel = $"سوژه تحت رصد: {nationalId}",
            RiskScore = 95,
            Properties = new() { { "NationalId", nationalId }, { "Watchlist", true } }
        };
        nodeMap[rootNode.Id] = rootNode;

        // سطح اول (Hop 1): واکشی تمام دارایی‌ها و ردپاهای مستقیم کدملی
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

        // ثبت گره‌های حساب‌های مبدأ
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

        // ثبت گره‌های خطوط تلفن
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

        // ثبت اسناد گمرکی
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

        // سطح دوم (Hop 2): پیشروی و رصد ارتباطات جانبی (حساب‌های واسط و دکل‌های مشترک)
        if (maxDepth >= 2)
        {
            // ۲.۱. واکشی حساب‌های واسط (Mule) که از حساب‌های فرد پول گرفته‌اند
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

            // ۲.۲. رصد دکل‌های مخابراتی پرتردد که خطوط فعال در آن دیده شده‌اند
            if (phoneLines.Any())
            {
                var phoneList = string.Join("','", phoneLines);
                var towerSightings = await _context.Database.SqlQueryRaw<TowerHopRecord>($@"
                    SELECT caller_msisdn AS Msisdn, cell_id AS CellId, COUNT(*) AS TotalCalls
                    FROM telecom_cdrs
                    WHERE caller_msisdn IN ('{phoneList}')
                    GROUP BY caller_msisdn, cell_id
                    LIMIT 6
                ").ToListAsync();

                foreach (var tw in towerSightings)
                {
                    var towerId = $"TOWER_{tw.CellId}";
                    if (!nodeMap.ContainsKey(towerId))
                    {
                        nodeMap[towerId] = new OntologyNode
                        {
                            Id = towerId,
                            Type = EntityType.CellTower,
                            DisplayLabel = $"دکل BTS: {tw.CellId}",
                            RiskScore = 60,
                            Properties = new() { { "CellId", tw.CellId }, { "TotalCalls", tw.TotalCalls } }
                        };
                    }
                    AddEdge(graph, edgeSet, $"TEL_{tw.Msisdn}", towerId, "CONNECTED_TO_TOWER", tw.TotalCalls);
                }
            }
        }

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
        var graph = new MultiHopDossierGraph { RootEntityId = nodeId, ExploredDepth = 1 };
        var nodeMap = new Dictionary<string, OntologyNode>();
        var edgeSet = new HashSet<string>();

        if (nodeId.StartsWith("ACC_") || nodeId.StartsWith("MULE_"))
        {
            var accNo = nodeId.Replace("ACC_", "").Replace("MULE_", "");
            // کشف تراکنش‌های تکمیلی این حساب
            var extraTxs = await _context.Database.SqlQueryRaw<TransferHopRecord>(@"
            SELECT source_account AS SourceAcc, dest_account AS DestAcc, amount_irr AS Amount
            FROM bank_transactions 
            WHERE source_account = {0} OR dest_account = {0}
            LIMIT 10
        ", accNo).ToListAsync();

            foreach (var tx in extraTxs)
            {
                var sId = $"ACC_{tx.SourceAcc}";
                var dId = $"MULE_{tx.DestAcc}";

                if (!nodeMap.ContainsKey(sId))
                    nodeMap[sId] = new OntologyNode { Id = sId, Type = EntityType.BankAccount, DisplayLabel = $"حساب: {tx.SourceAcc}", RiskScore = 75 };
                if (!nodeMap.ContainsKey(dId))
                    nodeMap[dId] = new OntologyNode { Id = dId, Type = EntityType.BankAccount, DisplayLabel = $"مقصد: {tx.DestAcc}", RiskScore = 85 };

                AddEdge(graph, edgeSet, sId, dId, "EXPANDED_TRANSFER", tx.Amount / 10.0);
            }
        }
        else if (nodeId.StartsWith("TEL_"))
        {
            var msisdn = nodeId.Replace("TEL_", "");
            var extraCdrs = await _context.Database.SqlQueryRaw<TowerHopRecord>(@"
            SELECT receiver_msisdn AS Msisdn, cell_id AS CellId, duration_seconds AS TotalCalls
            FROM telecom_cdrs 
            WHERE caller_msisdn = {0}
            LIMIT 8
        ", msisdn).ToListAsync();

            foreach (var cdr in extraCdrs)
            {
                var contactId = $"TEL_{cdr.Msisdn}";
                if (!nodeMap.ContainsKey(contactId))
                    nodeMap[contactId] = new OntologyNode { Id = contactId, Type = EntityType.TelecomEndpoint, DisplayLabel = $"مخاطب: {cdr.Msisdn}", RiskScore = 70 };

                AddEdge(graph, edgeSet, nodeId, contactId, "CALL_RECORD", cdr.TotalCalls);
            }
        }

        graph.Nodes = nodeMap.Values.ToList();
        return graph;
    }

    public async Task<PathfindingResultDto> FindShortestIntermediaryPathAsync(string sourceId, string targetId)
    {
        // ۱. استخراج زیرگراف ارتباطات مرتبط با هر دو گره جهت تحلیل همبستگی
        // برای پرفورمنس در مقیاس بالا، الگوریتم جستجوی سطح‌اول (BFS) روی یال‌های موجود اجرا می‌شود
        var result = new PathfindingResultDto
        {
            SourceId = sourceId,
            TargetId = targetId
        };

        // فرض کنید گره A یک شخص یا حساب است و گره B یک شرکت یا خط مقصد
        // یک کوئری سریع جهت یافتن پل‌های مشترک (Common Intermediaries) در پایگاه‌داده:
        var rawEdges = await _context.Database.SqlQueryRaw<RawPathEdge>(@"
        SELECT source_account AS Src, dest_account AS Tgt, 'TRANSFERRED_TO' AS Relation, amount_irr AS Weight
        FROM bank_transactions
        LIMIT 5000
    ").ToListAsync();

        // ساخت گراف مجاورت (Adjacency List)
        var adj = new Dictionary<string, List<(string Target, string Rel, double Weight)>>();
        void AddAdj(string u, string v, string rel, double w)
        {
            if (!adj.ContainsKey(u)) adj[u] = new();
            adj[u].Add((v, rel, w));
        }

        foreach (var e in rawEdges)
        {
            AddAdj($"ACC_{e.Src}", $"MULE_{e.Tgt}", e.Relation, e.Weight);
            AddAdj($"MULE_{e.Tgt}", $"ACC_{e.Src}", e.Relation, e.Weight); // غیرجهت‌دار برای یافتن هرگونه کانال اتصال
        }

        // الگوریتم BFS برای پیدا کردن کوتاه‌ترین زنجیره واسطه‌ها
        var queue = new Queue<string>();
        var visited = new HashSet<string>();
        var parentMap = new Dictionary<string, (string Parent, string Rel, double Weight)>();

        queue.Enqueue(sourceId);
        visited.Add(sourceId);

        bool found = false;

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (current == targetId)
            {
                found = true;
                break;
            }

            if (adj.TryGetValue(current, out var neighbors))
            {
                foreach (var n in neighbors)
                {
                    if (!visited.Contains(n.Target))
                    {
                        visited.Add(n.Target);
                        parentMap[n.Target] = (current, n.Rel, n.Weight);
                        queue.Enqueue(n.Target);
                    }
                }
            }
        }

        if (found)
        {
            result.PathExists = true;
            var curr = targetId;
            var path = new List<string> { curr };

            while (curr != sourceId && parentMap.ContainsKey(curr))
            {
                var p = parentMap[curr];
                result.PathEdges.Insert(0, new OntologyEdge
                {
                    SourceId = p.Parent,
                    TargetId = curr,
                    Predicate = p.Rel,
                    Weight = p.Weight
                });
                curr = p.Parent;
                path.Insert(0, curr);
            }

            result.PathNodeIds = path;
            result.NarrativeSummary = $"شناسایی کانال ارتباطی با {path.Count - 2} واسطه پنهان میان دو موجودیت.";
        }
        else
        {
            result.PathExists = false;
            result.NarrativeSummary = "هیچ کانال ارتباطی مستقیمی تا عمق تعیین‌شده بین این دو نقطه یافت نشد.";
        }

        return result;
    }

    private class RawPathEdge
    {
        public string Src { get; set; } = string.Empty;
        public string Tgt { get; set; } = string.Empty;
        public string Relation { get; set; } = string.Empty; // این پراپرتی جا افتاده بود
        public double Weight { get; set; }
    }
    private class TransferHopRecord { public string SourceAcc { get; set; } public string DestAcc { get; set; } public long Amount { get; set; } }
    private class TowerHopRecord { public string Msisdn { get; set; } public string CellId { get; set; } public int TotalCalls { get; set; } }
    // اضافه کردن DTO برای نتیجه کشف مسیر
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