using Microsoft.EntityFrameworkCore;
using Dideban.Api.Domain.Entities;

namespace Dideban.Api.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<ReconciliationRule> ReconciliationRules => Set<ReconciliationRule>();
    public DbSet<DiscrepancyLog> DiscrepancyLogs => Set<DiscrepancyLog>();
    public DbSet<BomDefinition> BomDefinitions => Set<BomDefinition>(); // <-- جدول جدید
    public DbSet<TacticalGateway> TacticalGateways => Set<TacticalGateway>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // سید کردن قوانین قبلی
        modelBuilder.Entity<ReconciliationRule>().HasData(
            new ReconciliationRule
            {
                Id = 1,
                RuleName = "تطبیق دقیق کد تعرفه (HS Code)",
                SourceTableA = "ntsw_orders",
                SourceFieldA = "hs_code",
                SourceTableB = "epl_declarations",
                SourceFieldB = "declared_hs_code",
                Strategy = MatchingStrategy.Exact,
                ToleranceOrThreshold = 1.0,
                IsActive = true
            },
            new ReconciliationRule
            {
                Id = 2,
                RuleName = "بررسی بیش/کم اظهاری ارزش کل",
                SourceTableA = "ntsw_orders",
                SourceFieldA = "total_usd",
                SourceTableB = "epl_declarations",
                SourceFieldB = "declared_value_usd",
                Strategy = MatchingStrategy.NumericTolerance,
                ToleranceOrThreshold = 10.0,
                IsActive = true
            }
        );

        // سید کردن قطعات اصلی تشکیل‌دهنده یخچال بر اساس سناریوی تست
        modelBuilder.Entity<BomDefinition>().HasData(
            new BomDefinition
            {
                Id = 1,
                FinishedGoodName = "یخچال فریزر خانگی",
                FinishedGoodHsCode = "84182100",
                PartHsCode = "84143000",
                PartName = "کمپرسور برودتی",
                IsEssential = true
            },
            new BomDefinition
            {
                Id = 2,
                FinishedGoodName = "یخچال فریزر خانگی",
                FinishedGoodHsCode = "84182100",
                PartHsCode = "84189910",
                PartName = "بدنه و کابین درب یخچال",
                IsEssential = true
            },
            new BomDefinition
            {
                Id = 3,
                FinishedGoodName = "یخچال فریزر خانگی",
                FinishedGoodHsCode = "84182100",
                PartHsCode = "84189990",
                PartName = "کندانسور، اواپراتور و مدار سیم‌کشی",
                IsEssential = true
            }
        );
    }
}