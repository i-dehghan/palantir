using Dideban.Api.Domain.Entities;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Diagnostics;
using System.Text.Json.Serialization;

namespace Dideban.Api.Services;

public interface IReconciliationService
{
    Task<int> RunReconciliationAsync();
}

public class NlpPairItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("text1")]
    public string Text1 { get; set; } = string.Empty;

    [JsonPropertyName("text2")]
    public string Text2 { get; set; } = string.Empty;
}

public class NlpBatchRequest
{
    [JsonPropertyName("pairs")]
    public List<NlpPairItem> Pairs { get; set; } = new();
}

public class NlpSimilarityResult
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("similarity_score")]
    public double SimilarityScore { get; set; }
}

public class ReconciliationService : IReconciliationService
{
    private readonly AppDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ReconciliationService> _logger;

    public ReconciliationService(
        AppDbContext context,
        IHttpClientFactory httpClientFactory,
        ILogger<ReconciliationService> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<int> RunReconciliationAsync()
    {
        var stopwatch = Stopwatch.StartNew();
        _logger.LogInformation("شروع پایش ترکیبی (قوانین قطعی + NLP دسته‌ای)...");

        // ۱. اجرای قوانین قطعی با رویکرد Set-based در دیتابیس
        var hsCount = await _context.Database.ExecuteSqlRawAsync(@"
                INSERT INTO ""DiscrepancyLogs"" 
                (""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
                SELECT 
                    o.order_reg_number,
                    d.cottage_number,
                    o.importer_national_id,
                    'مغایرت کد تعرفه گمرکی',
                    'کد تعرفه ثبت‌سفارش (' || o.hs_code || ') با تعرفه ترخیص (' || d.declared_hs_code || ') مغایرت دارد.',
                    85,
                    datetime('now')
                FROM ntsw_orders o
                JOIN epl_declarations d ON o.order_reg_number = d.order_reg_number
                WHERE d.is_audited = 0 AND o.hs_code != d.declared_hs_code;
            ");

        var valCount = await _context.Database.ExecuteSqlRawAsync(@"
                INSERT INTO ""DiscrepancyLogs"" 
                (""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
                SELECT 
                    o.order_reg_number,
                    d.cottage_number,
                    o.importer_national_id,
                    'کم‌اظهاری فاحش ارزش گمرکی',
                    'ارزش ترخیص شده بیش از ۴۰٪ کمتر از فاکتور ثبت سفارش است.',
                    90,
                    datetime('now')
                FROM ntsw_orders o
                JOIN epl_declarations d ON o.order_reg_number = d.order_reg_number
                WHERE d.is_audited = 0 AND d.declared_value_usd < (o.total_usd * 0.60);
            ");

        // ۲. آماده‌سازی رکوردهای نامتقارن متنی برای ارسال دسته‌ای به پایتون
        // فقط پرونده‌هایی را لود می‌کنیم که متن آنها دقیقاً برابر نیست
        var textCandidates = await _context.Database
        .SqlQueryRaw<TextMismatchCandidate>(@"
        SELECT 
            d.cottage_number AS CottageNumber,
            o.order_reg_number AS OrderRegNumber,
            o.importer_national_id AS ImporterNationalId,
            o.goods_description AS GoodsDescriptionOrder,
            d.declared_goods_description AS GoodsDescriptionDeclared
        FROM ntsw_orders o
        JOIN epl_declarations d ON o.order_reg_number = d.order_reg_number
        WHERE d.is_audited = 0 
          AND o.goods_description != d.declared_goods_description
          AND (o.total_usd > 50000 OR o.hs_code != d.declared_hs_code)
        LIMIT 2000;
    ")
        .ToListAsync();

        int nlpDiscrepancies = 0;

        if (textCandidates.Count > 0)
        {
            var client = _httpClientFactory.CreateClient();
            const int batchSize = 1000;

            for (int i = 0; i < textCandidates.Count; i += batchSize)
            {
                var chunk = textCandidates.Skip(i).Take(batchSize).ToList();
                var payload = chunk.Select(c => new BatchCompareItemDto
                {
                    Id = c.CottageNumber,
                    OrderRegText = c.GoodsDescriptionOrder,
                    CustomsDecText = c.GoodsDescriptionDeclared
                }).ToList();


                try
                {
                    var response = await client.PostAsJsonAsync("http://localhost:8000/api/v1/compare-batch", payload);
                    if (response.IsSuccessStatusCode)
                    {
                        var scores = await response.Content.ReadFromJsonAsync<List<NlpSimilarityResult>>();
                        if (scores != null)
                        {
                            var lookup = scores.ToDictionary(s => s.Id, s => s.SimilarityScore);

                            var detectedLogs = new List<DiscrepancyLog>();
                            var now = DateTime.UtcNow;

                            foreach (var candidate in chunk)
                            {
                                if (lookup.TryGetValue(candidate.CottageNumber, out var simScore) && simScore < 60.0)
                                {
                                    detectedLogs.Add(new DiscrepancyLog
                                    {
                                        OrderRegNumber = candidate.OrderRegNumber,
                                        CottageNumber = candidate.CottageNumber,
                                        ImporterNationalId = candidate.ImporterNationalId,
                                        RuleName = "مغایرت ماهوی شرح کالا (هوش مصنوعی)",
                                        Description = $"تشابه شرح اظهارنامه با ثبت سفارش تنها {simScore}٪ است.",
                                        RiskScore = 92,
                                        DetectedAt = now
                                    });
                                }
                            }

                            // ثبت یک‌باره کل لاگ‌های کشف‌شده در یک تراکنش سریع:
                            if (detectedLogs.Count > 0)
                            {
                                // شکستن لاگ‌ها به دسته‌های ۵۰۰تایی برای جلوگیری از محدودیت تعداد پارامتر در SQLite
                                const int insertBatchSize = 500;

                                for (int b = 0; b < detectedLogs.Count; b += insertBatchSize)
                                {
                                    var currentBatch = detectedLogs.Skip(b).Take(insertBatchSize).ToList();
                                    var sqlBuilder = new System.Text.StringBuilder();

                                    sqlBuilder.Append(@"
                                    INSERT INTO ""DiscrepancyLogs"" 
                                    (""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
                                    VALUES ");

                                    var parameters = new List<Microsoft.Data.Sqlite.SqliteParameter>();

                                    for (int k = 0; k < currentBatch.Count; k++)
                                    {
                                        var log = currentBatch[k];
                                        if (k > 0) sqlBuilder.Append(", ");

                                        sqlBuilder.Append($"(@p{k}_0, @p{k}_1, @p{k}_2, @p{k}_3, @p{k}_4, @p{k}_5, @p{k}_6)");

                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_0", log.OrderRegNumber));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_1", log.CottageNumber));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_2", log.ImporterNationalId));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_3", log.RuleName));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_4", log.Description));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_5", log.RiskScore));
                                        parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter($"@p{k}_6", log.DetectedAt));
                                    }

                                    await _context.Database.ExecuteSqlRawAsync(sqlBuilder.ToString(), parameters);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"سرویس پایتون در دسترس نیست یا با خطا مواجه شد: {ex.Message}");
                }
            }
        }

        // ۳. علامت‌گذاری نهایی اسناد پردازش‌شده
        await _context.Database.ExecuteSqlRawAsync(@"
                UPDATE ""epl_declarations"" 
                SET ""is_audited"" = 1 
                WHERE ""is_audited"" = 0;
            ");

        stopwatch.Stop();
        var total = hsCount + valCount + nlpDiscrepancies;
        _logger.LogInformation($"پایش با موفقیت انجام شد. کل تخلفات جدید: {total} (شامل {nlpDiscrepancies} تخلف NLP) | زمان کل: {stopwatch.ElapsedMilliseconds} میلی‌ثانیه");

        return total;
    }


}

public class TextMismatchCandidate
{
    public string CottageNumber { get; set; } = string.Empty;
    public string OrderRegNumber { get; set; } = string.Empty;
    public string ImporterNationalId { get; set; } = string.Empty;
    public string GoodsDescriptionOrder { get; set; } = string.Empty;
    public string GoodsDescriptionDeclared { get; set; } = string.Empty;
}

public class BatchCompareItemDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("order_reg_text")]
    public string OrderRegText { get; set; } = string.Empty;

    [JsonPropertyName("customs_dec_text")]
    public string CustomsDecText { get; set; } = string.Empty;
}

public class BatchCompareResponseItemDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("result")]
    public CompareResultDto Result { get; set; } = new();
}

public class CompareResultDto
{
    [JsonPropertyName("combined_score")]
    public double CombinedScore { get; set; }

    [JsonPropertyName("is_mismatch")]
    public bool IsMismatch { get; set; }

    [JsonPropertyName("risk_level")]
    public string RiskLevel { get; set; } = string.Empty;
}