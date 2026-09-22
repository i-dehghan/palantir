using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services.Strategies;

public class TelecomAuditStrategy : IAuditDomainStrategy
{
    private readonly AppDbContext _context;
    public string DomainName => "TELECOM";

    public TelecomAuditStrategy(AppDbContext context)
    {
        _context = context;
    }

    public async Task<int> RunAuditAsync()
    {
        // ۱. کشف کانون‌های تقلب سیم‌باکس (SIM Box Hub):
        // تماس‌گیرندگانی که با حداقل ۱۵ مقصد مختلف مکالمه کوتاه (زیر ۳۰ ثانیه) داشته‌اند
        var simBoxSql = @"
            INSERT INTO ""DiscrepancyLogs"" 
            (""DomainType"", ""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
            SELECT 
                'TELECOM',
                caller_msisdn,
                cell_id,
                caller_national_id,
                'تقلب قاچاق ترافیک بین‌الملل (SIM Box Cluster)',
                'برقراری ' || COUNT(*) || ' تماس غیرمتعارف به ' || COUNT(DISTINCT receiver_msisdn) || ' مقصد مختلف با مدت زمان کوتاه.',
                96,
                datetime('now')
            FROM telecom_cdrs
            WHERE is_audited = 0 AND duration_seconds < 30
            GROUP BY caller_msisdn, caller_national_id, cell_id
            HAVING COUNT(DISTINCT receiver_msisdn) >= 15;
        ";

        // ۲. کشف تماس‌های تک‌زنگ پرخطر و کلاهبرداری مخابراتی (Wangiri Fraud):
        // تماس‌های بین‌المللی با مدت زمان ۱ تا ۳ ثانیه
        var wangiriSql = @"
            INSERT INTO ""DiscrepancyLogs"" 
            (""DomainType"", ""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
            SELECT 
                'TELECOM',
                caller_msisdn,
                call_id,
                caller_national_id,
                'کلاهبرداری تلفنی تک‌زنگ بین‌المللی (Wangiri Fraud)',
                'ثبت الگوی تماس تک‌زنگ بین‌المللی با طول مدت ' || duration_seconds || ' ثانیه جهت ترغیب به تماس برگشتی پرهزینه.',
                89,
                datetime('now')
            FROM telecom_cdrs
            WHERE is_audited = 0 AND call_type = 'VOICE_INTL' AND duration_seconds <= 3;
        ";

        var insertedSimbox = await _context.Database.ExecuteSqlRawAsync(simBoxSql);
        var insertedWangiri = await _context.Database.ExecuteSqlRawAsync(wangiriSql);

        // علامت‌گذاری ۱ میلیون رکورد مخابرات به عنوان بررسی‌شده
        await _context.Database.ExecuteSqlRawAsync("UPDATE telecom_cdrs SET is_audited = 1 WHERE is_audited = 0;");

        return insertedSimbox + insertedWangiri;
    }
}