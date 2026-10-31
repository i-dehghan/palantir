using System.Security.Cryptography;
using System.Text;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services.Identity;

public sealed class RefreshSessionService(IdentityDbContext db, JwtTokenService jwt)
{
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
        .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    public async Task<(string Token, string AccessToken, DateTimeOffset Expires)> CreateAsync(ApplicationUser user, CancellationToken ct)
    {
        var raw = NewToken();
        var expires = DateTimeOffset.UtcNow.AddDays(7);
        db.RefreshSessions.Add(new RefreshSession { UserId = user.Id, TokenHash = Hash(raw), ExpiresAtUtc = expires, SecurityVersion = user.SecurityVersion });
        await db.SaveChangesAsync(ct);
        var (access, _) = await jwt.IssueAsync(user, ct);
        return (raw, access, expires);
    }

    public async Task<(string Token, string AccessToken, DateTimeOffset AccessExpires)?> RotateAsync(string raw, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var session = await db.RefreshSessions.Include(s => s.User).SingleOrDefaultAsync(s => s.TokenHash == Hash(raw), ct);
        if (session is null) return null;
        if (session.RevokedAtUtc.HasValue)
        {
            // A reused token revokes all sessions for this user.
            await db.RefreshSessions.Where(s => s.UserId == session.UserId && s.RevokedAtUtc == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), ct);
            await transaction.CommitAsync(ct);
            return null;
        }
        if (session.ExpiresAtUtc <= now || !session.User.IsActive || session.SecurityVersion != session.User.SecurityVersion) return null;
        var replacement = new RefreshSession { UserId = session.UserId, ExpiresAtUtc = now.AddDays(7), SecurityVersion = session.User.SecurityVersion };
        // Use a separate raw token so only its hash reaches the database.
        var nextRaw = NewToken();
        replacement.TokenHash = Hash(nextRaw);
        session.RevokedAtUtc = now;
        session.ReplacedById = replacement.Id;
        db.RefreshSessions.Add(replacement);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var (access, expiry) = await jwt.IssueAsync(session.User, ct);
        return (nextRaw, access, expiry);
    }

    public async Task RevokeAsync(string raw, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await db.RefreshSessions.Where(s => s.TokenHash == Hash(raw) && s.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), ct);
    }
}
