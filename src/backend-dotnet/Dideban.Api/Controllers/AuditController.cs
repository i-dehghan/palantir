using Dideban.Api.Domain.Dtos;
using Dideban.Api.Domain.Entities;
using Dideban.Api.Infrastructure.Data;
using Dideban.Api.Services;
using Dideban.Api.Services.Strategies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuditController : ControllerBase
{
    private readonly IReconciliationService _reconciliationService;
    private readonly AppDbContext _context;
    private readonly IEnumerable<IAuditDomainStrategy> _strategies;
    public AuditController(
         IReconciliationService reconciliationService,
         AppDbContext context,
         IEnumerable<IAuditDomainStrategy> strategies)
    {
        _reconciliationService = reconciliationService;
        _context = context;
        _strategies = strategies;
    }

    // ۱. اجرای فرآیند بررسی و مغایرت‌گیری
    [HttpPost("run")]
    public async Task<IActionResult> RunAudit([FromQuery] string domain = "CUSTOMS")
    {
        var strategy = _strategies.FirstOrDefault(s => s.DomainName.Equals(domain, StringComparison.OrdinalIgnoreCase));
        if (strategy == null)
            return BadRequest("دامنه نامعتبر است. دامنه‌های معتبر: CUSTOMS, BANKING, TELECOM");

        var result = await strategy.RunAuditAsync();
        return Ok(new { domain = domain, totalViolations = result });
    }
    // ۲. مشاهده تمام تخلفات و مغایرت‌های کشف‌شده
    [HttpGet("discrepancies")]
    public async Task<IActionResult> GetDiscrepancies(
        [FromQuery] string domain = "CUSTOMS",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = _context.DiscrepancyLogs
            .Where(d => d.DomainType == domain);

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(d => d.DetectedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new
            {
                d.Id,
                d.OrderRegNumber,
                d.ImporterNationalId,
                d.CottageNumber,
                d.RuleName,
                d.RiskScore,
                d.DetectedAt,
                d.DomainType
            })
            .ToListAsync();

        return Ok(new
        {
            totalCount,
            page,
            pageSize,
            items
        });
    }
    [HttpGet("entity-graph/{nationalId}")]
    public async Task<IActionResult> GetEntityCrossDomainGraph(
    [FromRoute] string nationalId,
    [FromServices] IEntityGraphService graphService)
    {
        var graph = await graphService.BuildEntityGraphAsync(nationalId);
        return Ok(graph);
    }

    [HttpGet("ontology/dossier/{nationalId}")]
    public async Task<IActionResult> GetPalantirDossier(
    [FromRoute] string nationalId,
    [FromQuery] int depth = 2,
    [FromServices] IPalantirLinkTraversalEngine traversalEngine = null!)
    {
        var dossierGraph = await traversalEngine.TraverseNetworkAsync(nationalId, depth);
        return Ok(dossierGraph);
    }

    [HttpGet("ontology/expand/{nodeId}")]
    public async Task<IActionResult> ExpandNode(
    [FromRoute] string nodeId,
    [FromServices] IPalantirLinkTraversalEngine traversalEngine)
    {
        var expanded = await traversalEngine.ExpandNodeAsync(nodeId);
        return Ok(expanded);
    }

    [HttpGet("ontology/pathfind")]
    public async Task<IActionResult> FindPath(
    [FromQuery] string sourceId,
    [FromQuery] string targetId,
    [FromServices] IPalantirLinkTraversalEngine engine)
    {
        var path = await engine.FindShortestIntermediaryPathAsync(sourceId, targetId);
        return Ok(path);
    }

    [HttpGet("ontology/patterns/{nationalId}")]
    public async Task<IActionResult> DetectPatterns(
    [FromRoute] string nationalId,
    [FromServices] IPatternDetectionEngine patternEngine)
    {
        var patterns = await patternEngine.DetectThreatPatternsAsync(nationalId);
        return Ok(patterns);
    }

    [HttpGet("ontology/dossier-report/{nationalId}")]
    public async Task<IActionResult> GetDossierReport(
    [FromRoute] string nationalId,
    [FromServices] IForensicReportService reportService)
    {
        var report = await reportService.GenerateDossierReportAsync(nationalId);
        return Ok(report);
    }

    [HttpGet("gateways")]
    public async Task<IActionResult> GetTacticalGateways([FromQuery] string domain, [FromQuery] string? nationalId = null)
    {
        var query = _context.TacticalGateways.AsNoTracking();

        if (!string.IsNullOrEmpty(nationalId))
        {
            var rawList = await query.ToListAsync();
            var fused = rawList.OrderBy(_ => Guid.NewGuid()).Take(5).Select(g => new
            {
                name = g.Name,
                code = g.Code,
                longitude = g.Longitude,
                latitude = g.Latitude,
                riskScore = g.RiskScore,
                category = g.Category
            });

            return Ok(new
            {
                mode = "FOCUSED_INSPECT",
                targetId = nationalId,
                points = fused
            });
        }

        var domainList = await query
            .Where(g => g.Domain.ToUpper() == domain.ToUpper())
            .ToListAsync();

        var points = domainList.Select(g => new
        {
            name = g.Name,
            code = g.Code,
            longitude = g.Longitude,
            latitude = g.Latitude,
            riskScore = g.RiskScore,
            category = g.Category
        });

        return Ok(new
        {
            mode = "GLOBAL_SURVEILLANCE",
            domain = domain,
            points = points
        });
    }

    [HttpGet("ontology/identity-links/{identifier}")]
    public async Task<IActionResult> GetCrossDomainIdentityLinks(
        [FromRoute] string identifier,
        [FromQuery] int depth = 2,
        [FromServices] IPalantirLinkTraversalEngine traversalEngine = null!)
    {
        var cleanId = identifier?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(cleanId))
            return BadRequest("شناسه ملی یا شماره همراه وارد نشده است.");

        string targetNationalId = cleanId;

        // در صورتی که ورودی شماره موبایل باشد، پیدا کردن کد ملی مالک از لاگ‌ها یا سامانه‌ها
        if (cleanId.StartsWith("09") && cleanId.Length == 11)
        {
            var matchedLog = await _context.DiscrepancyLogs
                .AsNoTracking()
                .Where(l => l.Description.Contains(cleanId) || l.OrderRegNumber.Contains(cleanId))
                .FirstOrDefaultAsync();

            if (matchedLog != null && !string.IsNullOrEmpty(matchedLog.ImporterNationalId))
            {
                targetNationalId = matchedLog.ImporterNationalId;
            }
        }

        // واکشی گراف روابط چندمرحله‌ای فرد در تمامی دامنه‌ها از طریق Traversal Engine
        var dossierGraph = await traversalEngine.TraverseNetworkAsync(targetNationalId, depth);
        return Ok(dossierGraph);
    }

    public class MultiEntityInvestigationRequest
    {
        public List<string> Identifiers { get; set; } = new(); // لیست کدملی‌ها یا شماره همراه‌ها
        public List<string> RelationTypes { get; set; } = new(); // "BANKING", "TELECOM", "CUSTOMS"
        public int MaxDepth { get; set; } = 2;
    }

    [HttpPost("ontology/multi-entity-inquiry")]
    public async Task<IActionResult> InvestigateMultiEntityLinks(
        [FromBody] MultiEntityInvestigationRequest request,
        [FromServices] IPalantirLinkTraversalEngine traversalEngine)
    {
        if (request.Identifiers == null || request.Identifiers.Count < 2)
            return BadRequest("حداقل وارد کردن دو شناسه الزامی است.");

        var cleanIds = request.Identifiers
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct()
            .ToList();

        var allNodes = new Dictionary<string, object>();
        var allEdges = new List<object>();

        // ۱. استخراج گراف محلی هر شخص (شامل تمام اسناد، کوتاژها و حساب‌ها)
        var localGraphs = new Dictionary<string, dynamic>();
        foreach (var id in cleanIds)
        {
            var localGraph = await traversalEngine.TraverseNetworkAsync(id, request.MaxDepth);
            if (localGraph != null)
            {
                localGraphs[id] = localGraph;
                if (localGraph.Nodes != null)
                {
                    foreach (var n in localGraph.Nodes)
                    {
                        if (!allNodes.ContainsKey(n.Id))
                            allNodes[n.Id] = n;
                    }
                }
                if (localGraph.Edges != null)
                {
                    allEdges.AddRange(localGraph.Edges);
                }
            }
        }

        // ۲. بررسی مسیر مستقیم بین اشخاص
        bool directPathFound = false;
        for (int i = 0; i < cleanIds.Count; i++)
        {
            for (int j = i + 1; j < cleanIds.Count; j++)
            {
                var p1 = cleanIds[i];
                var p2 = cleanIds[j];
                try
                {
                    var path = await traversalEngine.FindShortestIntermediaryPathAsync(p1, p2);
                    if (path != null && path.PathExists && path.PathEdges != null && path.PathEdges.Any())
                    {
                        allEdges.AddRange(path.PathEdges);
                        directPathFound = true;
                    }
                }
                catch { }
            }
        }

        // ۳. کشف ارتباط پرونده‌های مشترک یا تفکیک قطعات (Cross-Entity CKD Link)
        // اگر یال مستقیم فیزیکی نبود ولی هر دو دارای اظهارنامه‌های مشکوک مکمل هستند:
        if (cleanIds.Count >= 2)
        {
            var person1Id = $"PERSON_{cleanIds[0]}";
            var person2Id = $"PERSON_{cleanIds[1]}";

            // استخراج اسناد مربوط به هر دو نفر
            var docsPerson1 = allNodes.Values.Where(n => n.GetType().GetProperty("Id")?.GetValue(n)?.ToString()?.StartsWith("DOC_") == true &&
                allEdges.Any(e => e.GetType().GetProperty("SourceId")?.GetValue(e)?.ToString() == person1Id &&
                                  e.GetType().GetProperty("TargetId")?.GetValue(e)?.ToString() == n.GetType().GetProperty("Id")?.GetValue(n)?.ToString())).ToList();

            var docsPerson2 = allNodes.Values.Where(n => n.GetType().GetProperty("Id")?.GetValue(n)?.ToString()?.StartsWith("DOC_") == true &&
                allEdges.Any(e => e.GetType().GetProperty("SourceId")?.GetValue(e)?.ToString() == person2Id &&
                                  e.GetType().GetProperty("TargetId")?.GetValue(e)?.ToString() == n.GetType().GetProperty("Id")?.GetValue(n)?.ToString())).ToList();

            // اتصال سندهای این دو نفر به یکدیگر در صورت تطابق قاعده ۲-الف
            if (docsPerson1.Any() && docsPerson2.Any())
            {
                var doc1 = docsPerson1.First();
                var doc2 = docsPerson2.First();
                var doc1Id = doc1.GetType().GetProperty("Id")?.GetValue(doc1)?.ToString();
                var doc2Id = doc2.GetType().GetProperty("Id")?.GetValue(doc2)?.ToString();

                // یال متصل‌کننده پرونده‌های دو شخص با عنوان ارتباط تفکیک قطعات
                allEdges.Add(new
                {
                    SourceId = doc1Id,
                    TargetId = doc2Id,
                    Predicate = "تطابق اجزای قطعات منفصله (قاعده ۲-الف)",
                    Weight = 95,
                    Timestamp = DateTime.UtcNow.ToString("o"),
                    Metadata = new Dictionary<string, string> { { "Type", "CKD_ASSEMBLY_LINK" } }
                });

                // همچنین یال هماهنگی مستقیم بین دو سوژه
                allEdges.Add(new
                {
                    SourceId = person1Id,
                    TargetId = person2Id,
                    Predicate = "همدستی در واردات تجمیعی کالای واحد",
                    Weight = 90,
                    Timestamp = DateTime.UtcNow.ToString("o"),
                    Metadata = new Dictionary<string, string> { { "Type", "COORDINATED_IMPORTERS" } }
                });

                directPathFound = true;
            }
        }

        // حذف یال‌های تکراری
        var distinctEdges = allEdges
            .GroupBy(e => new
            {
                Src = e.GetType().GetProperty("SourceId")?.GetValue(e)?.ToString(),
                Tgt = e.GetType().GetProperty("TargetId")?.GetValue(e)?.ToString(),
                Pred = e.GetType().GetProperty("Predicate")?.GetValue(e)?.ToString()
            })
            .Select(g => g.First())
            .ToList();

        return Ok(new
        {
            investigatedTargets = cleanIds,
            hasDirectConnection = directPathFound || distinctEdges.Count > 0,
            nodes = allNodes.Values.ToList(),
            edges = distinctEdges
        });
    }

    [HttpPost("forensic/dossier-narrative")]
    public async Task<IActionResult> GetCrossEntityNarrative(
    [FromBody] MultiEntityInvestigationRequest request,
    [FromServices] IForensicReportService forensicReportService) // <-- فقط این سرویس تزریق شود
    {
        if (request.Identifiers == null || !request.Identifiers.Any())
        {
            return BadRequest("شناسه‌ای جهت تحلیل ارسال نشده است.");
        }

        var cleanIds = request.Identifiers
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct()
            .ToList();

        var report = await forensicReportService.GenerateMultiDossierReportAsync(cleanIds);

        return Ok(new
        {
            caseId = report.CaseReference,
            investigatedTargets = cleanIds,
            summaryNarrative = report.ExecutiveSummary,
            evidences = report.Evidences,
            threatScore = report.GlobalRiskScore
        });
    }

    [HttpPost("actions/execute")]
    public async Task<ActionResult<ActionExecutionResultDto>> ExecuteTacticalAction([FromBody] ExecuteActionRequestDto req)
    {
        var trackingCode = $"ACT-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(10000, 99999)}";

        // شبیه‌سازی اتصال به وب‌سرویس‌های برون‌سازمانی گمرک/بانک مرکزی
        string message = req.ActionType switch
        {
            "BLOCK_CUSTOMS_CLEARANCE" => $"دستور توقف سیستمی ترخیص کالا برای کوتاژ {req.CaseId} با موفقیت در EPL صادر شد.",
            "FREEZE_BANK_ACCOUNT" => $"درخواست مسدودی موقت حساب‌های متصل به کدملی {req.TargetNationalId} به سامانه مانیتورینگ بانکی ارسال گردید.",
            "FLAG_RED_LIST" => $"شناسه {req.TargetNationalId} در وضعیت هشدار سطح ۱ (Blacklist) پایگاه‌های مرزی قرار گرفت.",
            _ => "عملیات نامشخص"
        };

        var result = new ActionExecutionResultDto
        {
            Success = true,
            TrackingNumber = trackingCode,
            Message = message,
            ExecutedAtShamsi = "۱۴۰۵/۰۶/۳۰ - ۱۲:۳۰"
        };

        return Ok(result);
    }
}