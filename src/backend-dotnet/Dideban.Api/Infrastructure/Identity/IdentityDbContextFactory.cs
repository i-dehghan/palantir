using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Dideban.Api.Infrastructure.Identity;

public sealed class IdentityDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args)
    {
        var configuredPath = Environment.GetEnvironmentVariable("DIDEBAN_IDENTITY_DB_PATH");
        string databasePath;

        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            databasePath = Path.GetFullPath(configuredPath);
        }
        else
        {
            // Discover the repository root rather than assuming the current working directory.
            var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (directory is not null &&
                   !File.Exists(Path.Combine(directory.FullName, "src", "backend-dotnet", "Dideban.Api", "Dideban.Api.csproj")))
            {
                directory = directory.Parent;
            }

            if (directory is null)
            {
                throw new InvalidOperationException(
                    "DIDEBAN repository root was not found. Set DIDEBAN_IDENTITY_DB_PATH.");
            }

            databasePath = Path.Combine(directory.FullName, "data", "dideban_identity.db");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseSqlite($"Data Source={databasePath}")
            .Options;
        return new IdentityDbContext(options);
    }
}
