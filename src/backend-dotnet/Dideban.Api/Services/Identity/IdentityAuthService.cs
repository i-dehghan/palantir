using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services.Identity;

public sealed class IdentityAuthService(IdentityDbContext db, IPasswordHasher<ApplicationUser> hasher)
{
    public async Task<ApplicationUser?> AuthenticateAsync(string username, string password, CancellationToken ct)
    {
        var normalized = username.Trim().ToUpperInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.NormalizedUserName == normalized, ct);
        // Equalize timing for unknown users; never disclose which credential failed.
        if (user is null)
        {
            var dummy = new ApplicationUser();
            hasher.VerifyHashedPassword(dummy, hasher.HashPassword(dummy, "dummy-password-not-a-secret"), password);
            return null;
        }
        var now = DateTimeOffset.UtcNow;
        if (!user.IsActive || (user.LockoutEndUtc.HasValue && user.LockoutEndUtc > now)) return null;
        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount = Math.Min(user.FailedLoginCount + 1, 100);
            if (user.FailedLoginCount >= 5)
            {
                user.LockoutEndUtc = now.AddMinutes(15);
                user.FailedLoginCount = 0;
            }
            await db.SaveChangesAsync(ct);
            return null;
        }
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
            user.PasswordHash = hasher.HashPassword(user, password);
        user.FailedLoginCount = 0;
        user.LockoutEndUtc = null;
        user.LastLoginAtUtc = now;
        await db.SaveChangesAsync(ct);
        return user;
    }
}
