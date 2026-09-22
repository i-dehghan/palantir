using Dideban.Api.Domain.Ontology;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services;

public class ThreatPatternDto
{
    public string PatternType { get; set; } = string.Empty; // CIRCULAR_FLOW, SMURFING, SIMBOX_COMMUNITY
    public string Title { get; set; } = string.Empty;
    public string Severity { get; set; } = "HIGH"; // CRITICAL, HIGH, MEDIUM
    public List<string> InvolvedNodeIds { get; set; } = new();
    public string Description { get; set; } = string.Empty;
    public double EstimatedVolumeIrr { get; set; }
}

public interface IPatternDetectionEngine
{
    Task<List<ThreatPatternDto>> DetectThreatPatternsAsync(string rootNationalId);
}

public class PatternDetectionEngine : IPatternDetectionEngine
{
    private readonly AppDbContext _context;

    public PatternDetectionEngine(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<ThreatPatternDto>> DetectThreatPatternsAsync(string rootNationalId)
    {
        var patterns = new List<ThreatPatternDto>();

        // ۱. واکشی تراکنش‌های مرتبط با سوژه
        var txs = await _context.Database.SqlQueryRaw<TxRecord>(@"
            SELECT source_account AS Src, dest_account AS Tgt, amount_irr AS Amount
            FROM bank_transactions
            WHERE customer_national_id = {0}
            LIMIT 200
        ", rootNationalId).ToListAsync();

        if (!txs.Any()) return patterns;

        // ۲. کشف الگوی خردسازی مبالغ (Structuring / Smurfing)
        // واریزهای متعدد با مبالغ نزدیک به سقف گزارش‌دهی یا یکسان به حساب‌های مقصد مختلف
        var smurfGroups = txs
            .GroupBy(t => t.Src)
            .Where(g => g.Count() >= 4)
            .ToList();

        foreach (var grp in smurfGroups)
        {
            var totalVolume = grp.Sum(x => (double)x.Amount);
            var destNodes = grp.Select(x => $"MULE_{x.Tgt}").Distinct().ToList();
            var involved = new List<string> { $"ACC_{grp.Key}" };
            involved.AddRange(destNodes);

            patterns.Add(new ThreatPatternDto
            {
                PatternType = "SMURFING",
                Title = "الگوی خردسازی و لایه‌بندی مبالغ (Structuring/Smurfing)",
                Severity = "CRITICAL",
                InvolvedNodeIds = involved,
                EstimatedVolumeIrr = totalVolume,
                Description = $"شناسایی {grp.Count()} فقره انتقال سریع از حساب مبدأ {grp.Key} به مقاصد واسط مختلف جهت دور زدن آستانه‌های نظارتی بانک مرکزی."
            });
        }

        // ۳. کشف الگوهای مخابراتی مشکوک (تراکم تماس‌های زیر ۱۰ ثانیه با دکل متمرکز - سیم‌باکس)
        var cdrs = await _context.Database.SqlQueryRaw<CdrRecord>(@"
            SELECT caller_msisdn AS Msisdn, cell_id AS CellId, COUNT(*) AS ShortCalls
            FROM telecom_cdrs
            WHERE caller_national_id = {0} AND duration_seconds <= 10
            GROUP BY caller_msisdn, cell_id
            HAVING COUNT(*) >= 5
        ", rootNationalId).ToListAsync();

        foreach (var c in cdrs)
        {
            patterns.Add(new ThreatPatternDto
            {
                PatternType = "SIMBOX_COMMUNITY",
                Title = "فعالیت سازمان‌یافته سیم‌باکس یا ترمینیشن غیرمجاز",
                Severity = "CRITICAL",
                InvolvedNodeIds = new List<string> { $"TEL_{c.Msisdn}", $"TOWER_{c.CellId}" },
                Description = $"ثبت {c.ShortCalls} تماس آنی با مدت کمتر از ۱۰ ثانیه روی دکل {c.CellId} توسط خط {c.Msisdn}."
            });
        }

        return patterns;
    }

    private class TxRecord { public string Src { get; set; } = string.Empty; public string Tgt { get; set; } = string.Empty; public long Amount { get; set; } }
    private class CdrRecord { public string Msisdn { get; set; } = string.Empty; public string CellId { get; set; } = string.Empty; public int ShortCalls { get; set; } }
}