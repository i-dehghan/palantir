using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;

namespace Dideban.Api.Security.Audit;

public sealed record SecurityAuditEvent(long Id, string OccurredAtUtc, string EventType,
    string? ActorUserId, string? Target, string Outcome, string CorrelationId,
    string PreviousHash, string EntryHash);

public sealed class SecurityAuditStore(IConfiguration configuration, IWebHostEnvironment environment)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _connectionString = BuildConnectionString(configuration, environment);

    private static string BuildConnectionString(IConfiguration configuration, IWebHostEnvironment environment)
    {
        var path = configuration["SecurityAudit:DatabasePath"];
        if (string.IsNullOrWhiteSpace(path))
            path = Path.Combine(environment.ContentRootPath, "data", "dideban_security_audit.db");
        path = Path.GetFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadWriteCreate,
            DefaultTimeout = 15 }.ToString();
    }

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS SecurityAuditEvents (
                  Id INTEGER PRIMARY KEY AUTOINCREMENT,
                  OccurredAtUtc TEXT NOT NULL,
                  EventType TEXT NOT NULL,
                  ActorUserId TEXT NULL,
                  Target TEXT NULL,
                  Outcome TEXT NOT NULL,
                  CorrelationId TEXT NOT NULL,
                  PreviousHash TEXT NOT NULL,
                  EntryHash TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS IX_SecurityAuditEvents_OccurredAtUtc ON SecurityAuditEvents(OccurredAtUtc);
                CREATE INDEX IF NOT EXISTS IX_SecurityAuditEvents_EventType ON SecurityAuditEvents(EventType);
                """;
            await command.ExecuteNonQueryAsync(ct);
        }
        finally { _gate.Release(); }
    }

    private static string Hash(string input) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input)));
    private static string Canonical(long id, string timestamp, string eventType, string? actor,
        string? target, string outcome, string correlation, string previous) =>
        System.Text.Json.JsonSerializer.Serialize(new object?[] { id, timestamp, eventType, actor,
            target, outcome, correlation, previous });

    public async Task AppendAsync(string eventType, string? actor, string? target, string outcome,
        string correlationId, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            var previous = "GENESIS";
            long nextId = 1;
            await using (var last = connection.CreateCommand())
            {
                last.Transaction = (SqliteTransaction)transaction;
                last.CommandText = "SELECT Id, EntryHash FROM SecurityAuditEvents ORDER BY Id DESC LIMIT 1";
                await using var reader = await last.ExecuteReaderAsync(ct);
                if (await reader.ReadAsync(ct))
                {
                    nextId = reader.GetInt64(0) + 1;
                    previous = reader.GetString(1);
                }
            }
            var timestamp = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
            var hash = Hash(Canonical(nextId, timestamp, eventType, actor, target, outcome, correlationId, previous));
            await using var insert = connection.CreateCommand();
            insert.Transaction = (SqliteTransaction)transaction;
            insert.CommandText = """
                INSERT INTO SecurityAuditEvents (Id, OccurredAtUtc, EventType, ActorUserId, Target,
                    Outcome, CorrelationId, PreviousHash, EntryHash)
                VALUES ($id, $time, $event, $actor, $target, $outcome, $correlation, $previous, $hash)
                """;
            insert.Parameters.AddWithValue("$id", nextId);
            insert.Parameters.AddWithValue("$time", timestamp);
            insert.Parameters.AddWithValue("$event", eventType);
            insert.Parameters.AddWithValue("$actor", (object?)actor ?? DBNull.Value);
            insert.Parameters.AddWithValue("$target", (object?)target ?? DBNull.Value);
            insert.Parameters.AddWithValue("$outcome", outcome);
            insert.Parameters.AddWithValue("$correlation", correlationId);
            insert.Parameters.AddWithValue("$previous", previous);
            insert.Parameters.AddWithValue("$hash", hash);
            await insert.ExecuteNonQueryAsync(ct);
            await transaction.CommitAsync(ct);
        }
        finally { _gate.Release(); }
    }

    public async Task<IReadOnlyList<SecurityAuditEvent>> QueryAsync(int take, string? eventType,
        CancellationToken ct = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, OccurredAtUtc, EventType, ActorUserId, Target, Outcome, CorrelationId,
                PreviousHash, EntryHash FROM SecurityAuditEvents
            WHERE ($event IS NULL OR EventType = $event)
            ORDER BY Id DESC LIMIT $take
            """;
        command.Parameters.AddWithValue("$event", (object?)eventType ?? DBNull.Value);
        command.Parameters.AddWithValue("$take", Math.Clamp(take, 1, 200));
        var items = new List<SecurityAuditEvent>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            items.Add(Read(reader));
        return items;
    }

    private static SecurityAuditEvent Read(SqliteDataReader reader) => new(
        reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3),
        reader.IsDBNull(4) ? null : reader.GetString(4),
        reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8));

    public async Task<(bool Valid, long Checked, long? InvalidId)> VerifyAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT Id, OccurredAtUtc, EventType, ActorUserId, Target, Outcome, CorrelationId,
                    PreviousHash, EntryHash FROM SecurityAuditEvents ORDER BY Id
                """;
            await using var reader = await command.ExecuteReaderAsync(ct);
            string previous = "GENESIS";
            long expectedId = 1, checkedCount = 0;
            while (await reader.ReadAsync(ct))
            {
                var item = Read(reader);
                var expectedHash = Hash(Canonical(item.Id, item.OccurredAtUtc, item.EventType,
                    item.ActorUserId, item.Target, item.Outcome, item.CorrelationId, item.PreviousHash));
                if (item.Id != expectedId || item.PreviousHash != previous || item.EntryHash != expectedHash)
                    return (false, checkedCount, item.Id);
                previous = item.EntryHash;
                expectedId++;
                checkedCount++;
            }
            return (true, checkedCount, null);
        }
        finally { _gate.Release(); }
    }
}
