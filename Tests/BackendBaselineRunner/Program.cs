using System.Security.Cryptography;
using System.Text.Json;
using Dideban.Api.Infrastructure.Data;
using Dideban.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

if (args.Length != 4 || args[0] != "--db" || args[2] != "--out")
{
    Console.Error.WriteLine("Usage: dotnet run --project Tests/BackendBaselineRunner -- --db <operational_benchmark.db> --out <new-report.json>");
    return 2;
}

var db = Path.GetFullPath(args[1]);
var output = Path.GetFullPath(args[3]);
if (!File.Exists(db) || Path.GetFileName(db) != "operational_benchmark.db"
    || Path.GetFileName(Path.GetDirectoryName(db)!) != "benchmark_3175"
    || Path.GetFileName(db).Contains("dev", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Only the staged benchmark_3175/operational_benchmark.db is permitted.");
if (File.Exists(output) || Directory.Exists(output))
    throw new IOException("Report already exists; refusing overwrite.");
if (Path.GetDirectoryName(output) != Path.GetDirectoryName(db))
    throw new InvalidOperationException("Report must be inside benchmark_3175.");

static string Hash(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
var beforeHash = Hash(db);
var builder = new SqliteConnectionStringBuilder { DataSource = db, Mode = SqliteOpenMode.ReadWrite, Pooling = false };
using var connection = new SqliteConnection(builder.ToString());
await connection.OpenAsync();
var expected = new[] { "DiscrepancyLogs", "SyntheticGroundTruth", "bank_transactions", "ntsw_orders", "epl_declarations", "telecom_cdrs" };
foreach (var table in expected)
{
    await using var check = connection.CreateCommand();
    check.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=$name";
    check.Parameters.AddWithValue("$name", table);
    if (Convert.ToInt64(await check.ExecuteScalarAsync()) != 1)
        throw new InvalidOperationException($"Missing table: {table}");
}
await using (var count = connection.CreateCommand())
{
    count.CommandText = "SELECT COUNT(*) FROM DiscrepancyLogs";
    if (Convert.ToInt64(await count.ExecuteScalarAsync()) != 0)
        throw new InvalidOperationException("Expected empty DiscrepancyLogs in fresh staged copy.");
}
await connection.CloseAsync();

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseSqlite(builder.ToString()).Options;
using var context = new AppDbContext(options);
using var loggerFactory = LoggerFactory.Create(b => b.AddConsole().SetMinimumLevel(LogLevel.Warning));
var service = new ReconciliationService(context, loggerFactory.CreateLogger<ReconciliationService>());
var produced = await service.RunReconciliationAsync();

var distribution = new List<object>();
await using (var inspect = new SqliteConnection(new SqliteConnectionStringBuilder
    { DataSource = db, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString()))
{
    await inspect.OpenAsync();
    await using var cmd = inspect.CreateCommand();
    cmd.CommandText = "SELECT DomainType, RiskScore, COUNT(*) FROM DiscrepancyLogs GROUP BY DomainType, RiskScore ORDER BY DomainType, RiskScore";
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
        distribution.Add(new { domain = reader.GetString(0), score = reader.GetInt32(1), count = reader.GetInt64(2) });
}
var report = new {
    phase = "3.1.7.5", status = "BASELINE_EXECUTED",
    database = db, sha256Before = beforeHash, sha256After = Hash(db),
    serviceReportedCount = produced, metricsType = "ACTUAL_BACKEND_BASELINE",
    distribution, groundTruthMatching = "NOT_EVALUATED",
    warning = "Original service uses LIMIT 700, index-dependent rules and hardcoded scores. This is not calibrated risk."
};
await File.WriteAllTextAsync(output, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"BASELINE_EXECUTED: {produced} logs. Report: {output}");
return 0;
