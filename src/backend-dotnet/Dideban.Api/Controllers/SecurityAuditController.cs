using System.Security.Claims;
using Dideban.Api.Infrastructure.Identity;
using Dideban.Api.Security.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/security-audit")]
[Authorize(Roles = "Admin")]
public sealed class SecurityAuditController(IdentityDbContext identity, SecurityAuditStore audit) : ControllerBase
{
    private async Task<bool> IsActiveAdminAsync(CancellationToken ct)
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) && await identity.Users.AsNoTracking()
            .AnyAsync(u => u.Id == id && u.IsActive &&
                u.UserRoles.Any(ur => ur.Role.NormalizedName == "ADMIN"), ct);
    }

    [HttpGet("events")]
    public async Task<IActionResult> Events([FromQuery] int take = 50,
        [FromQuery] string? eventType = null, CancellationToken ct = default)
    {
        if (!await IsActiveAdminAsync(ct)) return Forbid();
        return Ok(await audit.QueryAsync(take, eventType, ct));
    }

    [HttpGet("verify")]
    public async Task<IActionResult> Verify(CancellationToken ct)
    {
        if (!await IsActiveAdminAsync(ct)) return Forbid();
        var result = await audit.VerifyAsync(ct);
        return Ok(new { valid = result.Valid, checkedEvents = result.Checked,
            firstInvalidEventId = result.InvalidId });
    }
}
