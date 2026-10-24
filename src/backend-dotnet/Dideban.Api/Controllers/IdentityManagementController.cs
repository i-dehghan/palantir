using System.Security.Claims;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Dideban.Api.Security.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/identity-management")]
[Authorize(Roles = "Admin")]
public sealed class IdentityManagementController(
    IdentityDbContext db,
    IPasswordHasher<ApplicationUser> passwordHasher,
    SecurityAuditStore audit) : ControllerBase
{
    public sealed record CreateUserRequest(string UserName, string Password, Guid[]? RoleIds);
    public sealed record SetActiveRequest(bool IsActive, long ExpectedVersion);
    public sealed record CreateRoleRequest(string Name);
    public sealed record SetUserRolesRequest(Guid[] RoleIds, long ExpectedVersion);
    public sealed record SetRolePermissionsRequest(string[] PermissionCodes, long ExpectedVersion);

    private async Task<bool> IsCurrentAdminAsync(CancellationToken ct)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(id, out var userId)) return false;
        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsActive &&
            u.UserRoles.Any(ur => ur.Role.NormalizedName == "ADMIN"), ct);
    }

    private async Task<IActionResult?> DenyUnlessAdminAsync(CancellationToken ct) =>
        await IsCurrentAdminAsync(ct) ? null : Forbid();

    private Task AuditChangeAsync(string action, string target, CancellationToken ct) =>
        audit.AppendAsync(action, User.FindFirstValue(ClaimTypes.NameIdentifier), target, "Success", HttpContext.TraceIdentifier, ct);

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        var users = await db.Users.AsNoTracking().OrderBy(u => u.UserName)
            .Select(u => new { u.Id, u.UserName, u.IsActive, u.CreatedAtUtc, u.RolesVersion,
                Roles = u.UserRoles.Select(ur => new { ur.Role.Id, ur.Role.Name }) })
            .ToListAsync(ct);
        return Ok(users);
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        var name = request.UserName?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 128 ||
            string.IsNullOrEmpty(request.Password) || request.Password.Length is < 16 or > 1024)
            return BadRequest("UserName must be 1..128 characters and Password 16..1024 characters.");
        var normalized = name.ToUpperInvariant();
        if (await db.Users.AnyAsync(u => u.NormalizedUserName == normalized, ct))
            return Conflict("UserName already exists.");
        var roleIds = (request.RoleIds ?? []).Distinct().ToArray();
        if (await db.Roles.CountAsync(r => roleIds.Contains(r.Id), ct) != roleIds.Length)
            return BadRequest("Unknown role ID.");
        var user = new ApplicationUser { UserName = name, NormalizedUserName = normalized };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        db.Users.Add(user);
        foreach (var roleId in roleIds)
            db.UserRoles.Add(new ApplicationUserRole { User = user, RoleId = roleId });
        await db.SaveChangesAsync(ct);
        await AuditChangeAsync("Identity.UserCreated", user.Id.ToString(), ct);
        return Created($"/api/identity-management/users/{user.Id}", new { user.Id, user.UserName, user.IsActive });
    }

    // EF Core SQLite starts write transactions non-deferred; the first writer serializes
    // the active-Admin check and the mutation across independent API instances.
    private async Task<bool> HasOtherActiveAdminAsync(Guid excludedUserId, CancellationToken ct) =>
        await db.Users.AsNoTracking().AnyAsync(u => u.Id != excludedUserId && u.IsActive &&
            u.UserRoles.Any(ur => ur.Role.NormalizedName == "ADMIN"), ct);

    [HttpPut("users/{userId:guid}/active")]
    public async Task<IActionResult> SetActive(Guid userId, [FromBody] SetActiveRequest request, CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        if (request.ExpectedVersion < 0) return BadRequest("Invalid expected version.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return NotFound();
        if (user.RolesVersion != request.ExpectedVersion) return Conflict("User data changed. Reload before saving.");
        var actor = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!request.IsActive && Guid.TryParse(actor, out var actorId) && actorId == userId)
            return Conflict("You cannot deactivate your own account.");
        if (!request.IsActive && user.IsActive &&
            await db.UserRoles.AnyAsync(ur => ur.UserId == userId && ur.Role.NormalizedName == "ADMIN", ct) &&
            !await HasOtherActiveAdminAsync(userId, ct))
            return Conflict("The last active Admin cannot be deactivated.");
        var updated = await db.Users.Where(u => u.Id == userId && u.RolesVersion == request.ExpectedVersion)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, request.IsActive)
                .SetProperty(u => u.RolesVersion, u => u.RolesVersion + 1)
                .SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1), ct);
        if (updated != 1) return Conflict("User data changed. Reload before saving.");
        await transaction.CommitAsync(ct);
        await AuditChangeAsync("Identity.UserActiveChanged", userId.ToString(), ct);
        return NoContent();
    }

    [HttpGet("roles")]
    public async Task<IActionResult> GetRoles(CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        return Ok(await db.Roles.AsNoTracking().OrderBy(r => r.Name)
            .Select(r => new { r.Id, r.Name, r.PermissionsVersion, Permissions = r.RolePermissions.Select(rp => rp.Permission.Code) })
            .ToListAsync(ct));
    }

    [HttpPost("roles")]
    public async Task<IActionResult> CreateRole([FromBody] CreateRoleRequest request, CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 128) return BadRequest("Invalid role name.");
        var normalized = name.ToUpperInvariant();
        if (await db.Roles.AnyAsync(r => r.NormalizedName == normalized, ct)) return Conflict("Role exists.");
        var role = new ApplicationRole { Name = name, NormalizedName = normalized };
        db.Roles.Add(role);
        await db.SaveChangesAsync(ct);
        await AuditChangeAsync("Identity.RoleCreated", role.Id.ToString(), ct);
        return Created($"/api/identity-management/roles/{role.Id}", new { role.Id, role.Name });
    }

    [HttpGet("permissions")]
    public async Task<IActionResult> GetPermissions(CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        return Ok(await db.Permissions.AsNoTracking().OrderBy(p => p.Code)
            .Select(p => new { p.Id, p.Code, p.Description }).ToListAsync(ct));
    }

    [HttpPut("users/{userId:guid}/roles")]
    public async Task<IActionResult> SetUserRoles(Guid userId, [FromBody] SetUserRolesRequest request, CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        if (request.ExpectedVersion < 0) return BadRequest("Invalid expected version.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return NotFound();
        if (user.RolesVersion != request.ExpectedVersion) return Conflict("User roles changed. Reload before saving.");
        var ids = (request.RoleIds ?? []).Distinct().ToArray();
        if (await db.Roles.CountAsync(r => ids.Contains(r.Id), ct) != ids.Length)
            return BadRequest("Unknown role ID.");
        var adminId = await db.Roles.Where(r => r.NormalizedName == "ADMIN")
            .Select(r => (Guid?)r.Id).FirstOrDefaultAsync(ct);
        var currentId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (Guid.TryParse(currentId, out var actorId) && actorId == userId &&
            adminId.HasValue && !ids.Contains(adminId.Value))
            return Conflict("You cannot remove your own Admin role.");
        var existing = await db.UserRoles.Where(ur => ur.UserId == userId).ToListAsync(ct);
        if (adminId.HasValue && user.IsActive && existing.Any(ur => ur.RoleId == adminId.Value) &&
            !ids.Contains(adminId.Value) && !await HasOtherActiveAdminAsync(userId, ct))
            return Conflict("The last active Admin role cannot be removed.");
        var updated = await db.Users.Where(u => u.Id == userId && u.RolesVersion == request.ExpectedVersion)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.RolesVersion, u => u.RolesVersion + 1)
                .SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1), ct);
        if (updated != 1) return Conflict("User roles changed. Reload before saving.");
        db.UserRoles.RemoveRange(existing.Where(ur => !ids.Contains(ur.RoleId)));
        var oldIds = existing.Select(ur => ur.RoleId).ToHashSet();
        foreach (var id in ids.Where(id => !oldIds.Contains(id)))
            db.UserRoles.Add(new ApplicationUserRole { UserId = userId, RoleId = id });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await AuditChangeAsync("Identity.UserRolesChanged", userId.ToString(), ct);
        return NoContent();
    }

    [HttpPut("roles/{roleId:guid}/permissions")]
    public async Task<IActionResult> SetRolePermissions(Guid roleId, [FromBody] SetRolePermissionsRequest request, CancellationToken ct)
    {
        if (await DenyUnlessAdminAsync(ct) is { } denied) return denied;
        if (request.ExpectedVersion < 0) return BadRequest("Invalid expected version.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var role = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.Id == roleId, ct);
        if (role is null) return NotFound();
        if (role.NormalizedName == "ADMIN") return Conflict("Admin permissions are managed by the system seeder.");
        if (role.PermissionsVersion != request.ExpectedVersion) return Conflict("Role permissions changed. Reload before saving.");
        var codes = (request.PermissionCodes ?? []).Distinct(StringComparer.Ordinal).ToArray();
        var permissions = await db.Permissions.Where(p => codes.Contains(p.Code)).ToListAsync(ct);
        if (permissions.Count != codes.Length) return BadRequest("Unknown permission code.");
        var updated = await db.Roles.Where(r => r.Id == roleId && r.PermissionsVersion == request.ExpectedVersion)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.PermissionsVersion, r => r.PermissionsVersion + 1), ct);
        if (updated != 1) return Conflict("Role permissions changed. Reload before saving.");
        var existing = await db.RolePermissions.Where(rp => rp.RoleId == roleId).ToListAsync(ct);
        var ids = permissions.Select(p => p.Id).ToHashSet();
        db.RolePermissions.RemoveRange(existing.Where(rp => !ids.Contains(rp.PermissionId)));
        var oldIds = existing.Select(rp => rp.PermissionId).ToHashSet();
        foreach (var id in ids.Where(id => !oldIds.Contains(id)))
            db.RolePermissions.Add(new ApplicationRolePermission { RoleId = roleId, PermissionId = id });
        await db.SaveChangesAsync(ct);
        // Permission changes invalidate sessions of every user assigned this role.
        await db.Users.Where(u => u.UserRoles.Any(ur => ur.RoleId == roleId))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.SecurityVersion, u => u.SecurityVersion + 1), ct);
        await transaction.CommitAsync(ct);
        await AuditChangeAsync("Identity.RolePermissionsChanged", roleId.ToString(), ct);
        return NoContent();
    }
}
