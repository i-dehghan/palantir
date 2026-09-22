using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services.Strategies;

public class BankingAuditStrategy : IAuditDomainStrategy
{
    private readonly AppDbContext _context;
    public string DomainName => "BANKING";

    public BankingAuditStrategy(AppDbContext context)
    {
        _context = context;
    }

    public async Task<int> RunAuditAsync()
    {
        // ۱. قانون ساختارشکنی مبالغ (Smurfing): مبالغ بین ۹۰ تا ۹۹.۹ میلیون تومان
        var smurfingSql = @"
            INSERT INTO ""DiscrepancyLogs"" 
            (""DomainType"", ""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
            SELECT 
                'BANKING',
                t.source_account,
                t.transaction_rrn,
                t.customer_national_id,
                'مشکوک به پولشویی - ساختارشکنی مبالغ (Smurfing)',
                'انجام تراکنش مکرر در بازه ۹۰ تا ۱۰۰ میلیون تومان با مبلغ ' || printf('%,d', t.amount_irr / 10) || ' تومان جهت فرار از نظارت بانکی.',
                94,
                datetime('now')
            FROM bank_transactions t
            WHERE t.is_audited = 0 AND t.amount_irr BETWEEN 900000000 AND 999000000;
        ";

        // ۲. کشف حساب‌های تجمیع‌کننده قاطر (Mule Accounts): دریافت از حداقل ۵ حساب مبدأ
        var muleSql = @"
            INSERT INTO ""DiscrepancyLogs"" 
            (""DomainType"", ""OrderRegNumber"", ""CottageNumber"", ""ImporterNationalId"", ""RuleName"", ""Description"", ""RiskScore"", ""DetectedAt"")
            SELECT 
                'BANKING',
                dest_account,
                COUNT(DISTINCT source_account) || ' مبدأ واریز',
                customer_national_id,
                'کشف حساب تجمیع‌کننده مشکوک (Mule Account)',
                'دریافت ' || COUNT(*) || ' فقره واریزی از ' || COUNT(DISTINCT source_account) || ' حساب مبدأ مجزا در بازه زمانی کوتاه.',
                98,
                datetime('now')
            FROM bank_transactions
            WHERE is_audited = 0
            GROUP BY dest_account
            HAVING COUNT(DISTINCT source_account) >= 5;
        ";

        var insertedSmurfing = await _context.Database.ExecuteSqlRawAsync(smurfingSql);
        var insertedMules = await _context.Database.ExecuteSqlRawAsync(muleSql);

        // علامت‌گذاری رکوردهای پردازش‌شده
        await _context.Database.ExecuteSqlRawAsync("UPDATE bank_transactions SET is_audited = 1 WHERE is_audited = 0;");

        return insertedSmurfing + insertedMules;
    }
}