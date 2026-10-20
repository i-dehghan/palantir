using Dideban.Api.Domain.Identity;
using Dideban.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Infrastructure.Identity;

public static class IdentityPermissionSeeder
{
    public static async Task SeedAsync(IdentityDbContext db, CancellationToken ct = default)
    {
        // No EnsureCreated and no changes to operational AppDbContext.
        await db.Database.MigrateAsync(ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        foreach (var code in RegistryPermissions.All)
        {
            if (!await db.Permissions.AnyAsync(p => p.Code == code, ct))
                db.Permissions.Add(new ApplicationPermission { Code = code, Description = code });
        }
        await db.SaveChangesAsync(ct);

        var adminRole = await db.Roles.SingleOrDefaultAsync(r => r.NormalizedName == "ADMIN", ct);
        if (adminRole is not null)
        {
            var permissionIds = await db.Permissions
                .Where(p => RegistryPermissions.All.Contains(p.Code))
                .Select(p => p.Id).ToListAsync(ct);
            var grantedIds = await db.RolePermissions
                .Where(rp => rp.RoleId == adminRole.Id)
                .Select(rp => rp.PermissionId).ToListAsync(ct);
            foreach (var id in permissionIds.Except(grantedIds))
                db.RolePermissions.Add(new ApplicationRolePermission { RoleId = adminRole.Id, PermissionId = id });
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }
}
