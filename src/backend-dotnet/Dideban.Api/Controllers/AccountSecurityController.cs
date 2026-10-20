using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Dideban.Api.Security.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/account-security")]
public sealed class AccountSecurityController(
    IdentityDbContext db,
    IPasswordHasher<ApplicationUser> hasher,
    SecurityAuditStore audit) : ControllerBase
{
    public sealed record ChangePasswordRequest([Required] string CurrentPassword, [Required] string NewPassword);
    public sealed record ResetPasswordRequest([Required] string NewPassword);

    private Guid? ActorId => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private static bool ValidPassword(string? password) => password is { Length: >= 16 and <= 1024 };

    private async Task<bool> IsLiveAdminAsync(Guid actorId, CancellationToken ct) =>
        await db.Users.AsNoTracking().AnyAsync(u => u.Id == actorId && u.IsActive &&
            u.UserRoles.Any(ur => ur.Role.NormalizedName == "ADMIN"), ct);

    [HttpPost("change-password")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (ActorId is not { } actorId) return Unauthorized();
        if (!ValidPassword(request.NewPassword)) return BadRequest("Password must contain 16..1024 characters.");
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == actorId, ct);
        if (user is null || !user.IsActive) return Unauthorized();
        if (string.IsNullOrEmpty(request.CurrentPassword) ||
            hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            await audit.AppendAsync("Identity.PasswordChangeDenied", actorId.ToString(), actorId.ToString(),
                "InvalidCurrentPassword", HttpContext.TraceIdentifier, ct);
            return BadRequest("Current password is incorrect.");
        }
        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        user.FailedLoginCount = 0;
        user.LockoutEndUtc = null;
        await db.SaveChangesAsync(ct);
        await audit.AppendAsync("Identity.PasswordChanged", actorId.ToString(), actorId.ToString(),
            "Success", HttpContext.TraceIdentifier, ct);
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("users/{userId:guid}/reset-password")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> ResetPassword(Guid userId, [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        if (ActorId is not { } actorId) return Unauthorized();
        if (!await IsLiveAdminAsync(actorId, ct)) return Forbid();
        if (!ValidPassword(request.NewPassword)) return BadRequest("Password must contain 16..1024 characters.");
        if (actorId == userId) return Conflict("Use change-password to change your own password.");
        var target = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (target is null) return NotFound();
        target.PasswordHash = hasher.HashPassword(target, request.NewPassword);
        target.FailedLoginCount = 0;
        target.LockoutEndUtc = null;
        await db.SaveChangesAsync(ct);
        await audit.AppendAsync("Identity.AdminPasswordReset", actorId.ToString(), userId.ToString(),
            "Success", HttpContext.TraceIdentifier, ct);
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("users/lockouts")]
    public async Task<IActionResult> GetLockouts(CancellationToken ct)
    {
        if (ActorId is not { } actorId) return Unauthorized();
        if (!await IsLiveAdminAsync(actorId, ct)) return Forbid();
        return Ok(await db.Users.AsNoTracking().OrderBy(u => u.UserName)
            .Select(u => new { u.Id, u.UserName, u.IsActive, u.FailedLoginCount, u.LockoutEndUtc })
            .ToListAsync(ct));
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("users/{userId:guid}/unlock")]
    public async Task<IActionResult> Unlock(Guid userId, CancellationToken ct)
    {
        if (ActorId is not { } actorId) return Unauthorized();
        if (!await IsLiveAdminAsync(actorId, ct)) return Forbid();
        var target = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (target is null) return NotFound();
        target.FailedLoginCount = 0;
        target.LockoutEndUtc = null;
        await db.SaveChangesAsync(ct);
        await audit.AppendAsync("Identity.AccountUnlocked", actorId.ToString(), userId.ToString(),
            "Success", HttpContext.TraceIdentifier, ct);
        return NoContent();
    }
}
