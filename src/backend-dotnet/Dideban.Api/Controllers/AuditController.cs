using Microsoft.AspNetCore.Authorization;
using Dideban.Api.Security;
using Microsoft.AspNetCore.Mvc;
using Dideban.Api.Services;
using Dideban.Api.Domain.Dtos;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuditController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IReconciliationService _reconciliationService;
        private readonly IPalantirLinkTraversalEngine _traversalEngine;
        private readonly IWaybillHistoricalCorrelationService _waybillService;
        private readonly ITransitPathCorrelatorService _transitService;
        private readonly IWhatIfSimulationService _whatIfService;
        private readonly IForensicReportService _forensicReportService;

        public AuditController(
            AppDbContext context,
            IReconciliationService reconciliationService,
            IPalantirLinkTraversalEngine traversalEngine,
            IWaybillHistoricalCorrelationService waybillService,
            ITransitPathCorrelatorService transitService,
            IWhatIfSimulationService whatIfService,
            IForensicReportService forensicReportService)
        {
            _context = context;
            _reconciliationService = reconciliationService;
            _traversalEngine = traversalEngine;
            _waybillService = waybillService;
            _transitService = transitService;
            _whatIfService = whatIfService;
            _forensicReportService = forensicReportService;
        }

        /// <summary>Exploratory graph-priority analysis; not a finding of wrongdoing.</summary>
        [Authorize(Policy = RegistryPermissions.AuditRead)]
        [HttpPost("graph-risk/analyze")]
        [RequestSizeLimit(2_000_000)]
        public IActionResult AnalyzeGraphRisk([FromBody] GraphRiskAnalysisRequestDto? request)
        {
            if (request?.Graph is null)
                return BadRequest(new { error = "Graph is required." });

            var graph = request.Graph;
            if (graph.Nodes is null || graph.Edges is null || graph.Nodes.Count > 500 || graph.Edges.Count > 5000)
                return BadRequest(new { error = "Graph exceeds limits or has missing collections (max 500 nodes, 5000 edges)." });
            if (graph.Nodes.Any(n => n is null || string.IsNullOrWhiteSpace(n.Id)) ||
                graph.Nodes.Select(n => n.Id).Distinct(StringComparer.Ordinal).Count() != graph.Nodes.Count)
                return BadRequest(new { error = "Node IDs must be unique and non-empty." });
            if (graph.Edges.Any(e => e is null || string.IsNullOrWhiteSpace(e.SourceId) ||
                string.IsNullOrWhiteSpace(e.TargetId) || !double.IsFinite(e.Weight) || e.Weight <= 0))
                return BadRequest(new { error = "Edges must have valid endpoints and positive finite weights." });
            var ids = graph.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
            if (graph.Edges.Any(e => !ids.Contains(e.SourceId) || !ids.Contains(e.TargetId)))
                return BadRequest(new { error = "Edge endpoints must reference graph nodes." });
            if (graph.Nodes.Any(n => n.RiskScore is < 0 or > 100))
                return BadRequest(new { error = "Observed risk signals must be in [0, 100]." });

            var settings = new GraphRiskPropagationEngine.Settings(
                request.MaxHops, request.Decay, request.InfluenceCap);
            try { settings.Validate(); }
            catch (ArgumentOutOfRangeException)
            {
                return BadRequest(new { error = "Invalid propagation settings: MaxHops 1..6, Decay (0,1), InfluenceCap 0..100." });
            }

            var baseline = GraphRiskScoringEngine.Score(graph);
            var propagation = GraphRiskPropagationEngine.Propagate(graph, baseline, settings);
            return Ok(new GraphRiskAnalysisResponseDto(baseline.Version, propagation.Version,
                "Exploratory investigation-priority index only; not a probability or finding of wrongdoing.",
                baseline.Nodes, propagation.Nodes, propagation.Configuration));
        }

        [Authorize(Policy = RegistryPermissions.AuditRead)]
        [HttpGet("logs")]
        public async Task<IActionResult> GetDiscrepancies([FromQuery] string domain = "CUSTOMS")
        {
            try
            {
                // خواندن مستقیم لاگ‌های تحلیل‌شده از جدول DiscrepancyLogs بر اساس حوزه (CUSTOMS, BANKING, TELECOM)
                var normalizedDomain = (domain ?? "CUSTOMS").ToUpper();
                var logs = await _context.DiscrepancyLogs
                    .Where(d => d.DomainType == normalizedDomain)
                    .OrderByDescending(d => d.RiskScore)
                    .Take(100)
                    .ToListAsync();

                return Ok(logs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditExecute)]
        [HttpPost("run-reconciliation")]
        public async Task<IActionResult> RunReconciliation()
        {
            try
            {
                int discrepanciesCount = await _reconciliationService.RunReconciliationAsync();
                return Ok(new { success = true, discrepanciesCreated = discrepanciesCount, message = "رگرسیون و ارزیابی ریسک با موفقیت روی داده‌های خام اجرا شد." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditRead)]
        [HttpGet("dossier/{nationalId}")]
        public async Task<IActionResult> GetDossier(string nationalId, [FromQuery] int depth = 2)
        {
            try
            {
                var graph = await _traversalEngine.TraverseNetworkAsync(nationalId, depth);
                return Ok(graph);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditRead)]
        [HttpPost("multi-entity-links")]
        public async Task<IActionResult> QueryMultiEntityLinks([FromBody] MultiEntityQueryDto dto)
        {
            try
            {
                var graph = await _traversalEngine.TraverseMultiEntityNetworkAsync(dto.Identifiers, dto.MaxDepth);
                return Ok(graph);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditExecute)]
        [HttpPost("correlate-waybill-history")]
        public async Task<IActionResult> CorrelateWaybill([FromBody] WaybillCorrelationRequestDto dto)
        {
            try
            {
                var report = await _waybillService.CorrelateWaybillWithHistoryAsync(dto);
                return Ok(report);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditRead)]
        [HttpGet("transit-correlator")]
        public async Task<IActionResult> GetTransitCorrelator([FromQuery] string cottageNumber, [FromQuery] string driverMsisdn)
        {
            try
            {
                var report = await _transitService.CorrelateTransitWithCdrAsync(cottageNumber, driverMsisdn);
                return Ok(report);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [Authorize(Policy = RegistryPermissions.AuditExecute)]
        [HttpPost("what-if/simulate")]
        public async Task<IActionResult> SimulateWhatIf([FromBody] WhatIfRequestDto dto)
        {
            try
            {
                var result = await _whatIfService.SimulateInterventionAsync(dto.InterventionType, dto.TargetId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class MultiEntityQueryDto
    {
        public List<string> Identifiers { get; set; } = new();
        public List<string> RelationTypes { get; set; } = new();
        public int MaxDepth { get; set; } = 2;
    }

    public class WhatIfRequestDto
    {
        public string InterventionType { get; set; } = string.Empty;
        public string TargetId { get; set; } = string.Empty;
    }
}