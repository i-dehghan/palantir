using System.Text.Json;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

// Run from anywhere: resolve the repository root relative to this tool's project.
var repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
    "..", "..", "..", "..", ".."));
var apiDirectory = Path.Combine(repositoryRoot, "src", "backend-dotnet", "Dideban.Api");
var apiProject = Path.Combine(apiDirectory, "Dideban.Api.csproj");
if (!File.Exists(apiProject))
{
    Console.Error.WriteLine($"API project not found at {apiProject}. Check the tool location.");
    return 1;
}

var identityPath = Path.Combine(repositoryRoot, "data", "dideban_identity.db");
var configPath = Path.Combine(apiDirectory, "appsettings.Development.json");
if (File.Exists(configPath))
{
    using var json = JsonDocument.Parse(await File.ReadAllTextAsync(configPath));
    if (json.RootElement.TryGetProperty("Identity", out var identity) &&
        identity.TryGetProperty("DatabasePath", out var dbPathElement) &&
        dbPathElement.ValueKind == JsonValueKind.String)
    {
        var configured = dbPathElement.GetString();
        if (!string.IsNullOrWhiteSpace(configured))
            identityPath = Path.GetFullPath(configured, apiDirectory);
    }
}

if (!File.Exists(identityPath))
{
    Console.Error.WriteLine($"Identity database does not exist: {identityPath}");
    Console.Error.WriteLine("Refusing to create a new database for this test.");
    return 2;
}

Console.WriteLine($"Identity DB: {identityPath}");
Console.WriteLine("Password reset for existing account: admin");

var options = new DbContextOptionsBuilder<IdentityDbContext>()
    .UseSqlite($"Data Source={identityPath}").Options;
await using var db = new IdentityDbContext(options);
if (!await db.Database.CanConnectAsync())
{
    Console.Error.WriteLine("Cannot connect to existing Identity database.");
    return 4;
}

var user = await db.Users.SingleOrDefaultAsync(x => x.NormalizedUserName == "ADMIN");
if (user is null)
{
    Console.Error.WriteLine("Account admin does not exist. No changes made.");
    return 5;
}

Console.Write("New admin password (16-1024 characters; input hidden): ");
var password = ReadPassword();
Console.WriteLine();
if (password.Length is < 16 or > 1024)
{
    Console.Error.WriteLine("Password must contain 16-1024 characters. No changes made.");
    return 3;
}
Console.Write("Repeat new password (input hidden): ");
var confirmation = ReadPassword();
Console.WriteLine();
if (!string.Equals(password, confirmation, StringComparison.Ordinal))
{
    Console.Error.WriteLine("Passwords do not match. No changes made.");
    return 7;
}

// Reset the password and ensure the existing administrator is active and assigned Admin.
// Admin permissions are maintained by the existing IdentityPermissionSeeder.
var hasher = new PasswordHasher<ApplicationUser>();
var adminRole = await db.Roles.SingleOrDefaultAsync(r => r.NormalizedName == "ADMIN");
if (adminRole is null)
{
    Console.Error.WriteLine("System Admin role not found. No changes made.");
    return 8;
}

user.PasswordHash = hasher.HashPassword(user, password);
user.IsActive = true;
user.FailedLoginCount = 0;
user.LockoutEndUtc = null;
if (!await db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == adminRole.Id))
    db.UserRoles.Add(new ApplicationUserRole { UserId = user.Id, RoleId = adminRole.Id });
await db.SaveChangesAsync();
Console.WriteLine("SUCCESS: admin password reset, account active, Admin role assigned.");
Console.WriteLine("Role permissions are unchanged; run the API's IdentityPermissionSeeder if needed.");
Console.WriteLine("Sign in through the Angular login page with the new password.");
return 0;

static string ReadPassword()
{
    var characters = new List<char>();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) break;
        if (key.Key == ConsoleKey.Backspace)
        {
            if (characters.Count > 0) characters.RemoveAt(characters.Count - 1);
            continue;
        }
        if (!char.IsControl(key.KeyChar) && characters.Count < 1024)
            characters.Add(key.KeyChar);
    }
    return new string(characters.ToArray());
}
