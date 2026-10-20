using Dideban.Api.Domain.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Infrastructure.Identity;

public static class IdentityBootstrap
{
    public static async Task<int> RunAsync(IServiceProvider services, IConfiguration config)
    {
        var username = config["IdentityBootstrap:UserName"]?.Trim();
        var password = config["IdentityBootstrap:Password"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            Console.Error.WriteLine("Set IdentityBootstrap__UserName and IdentityBootstrap__Password for one-time bootstrap.");
            return 2;
        }
        if (username.Length > 128 || password.Length < 16 || password.Length > 1024)
        {
            Console.Error.WriteLine("Username must be <=128 chars and password 16..1024 chars.");
            return 2;
        }
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await db.Database.MigrateAsync();
        if (await db.Users.AnyAsync())
        {
            Console.Error.WriteLine("Bootstrap refused: users already exist.");
            return 3;
        }
        var role = await db.Roles.SingleOrDefaultAsync(r => r.NormalizedName == "ADMIN");
        if (role is null)
        {
            role = new ApplicationRole { Name = "Admin", NormalizedName = "ADMIN" };
            db.Roles.Add(role);
        }
        var user = new ApplicationUser { UserName = username, NormalizedUserName = username.ToUpperInvariant() };
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<ApplicationUser>>();
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        db.UserRoles.Add(new ApplicationUserRole { User = user, Role = role });
        await db.SaveChangesAsync();
        Console.WriteLine("Initial administrator created. Clear bootstrap environment variables now.");
        return 0;
    }
}
