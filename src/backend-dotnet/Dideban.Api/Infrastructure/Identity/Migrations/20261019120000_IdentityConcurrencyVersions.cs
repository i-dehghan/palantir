using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Dideban.Api.Infrastructure.Identity;

#nullable disable
namespace Dideban.Api.Infrastructure.Identity.Migrations;

[DbContext(typeof(IdentityDbContext))]
[Migration("20261019120000_IdentityConcurrencyVersions")]
public sealed class IdentityConcurrencyVersions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(name: "RolesVersion", table: "IdentityUsers", type: "INTEGER", nullable: false, defaultValue: 0L);
        migrationBuilder.AddColumn<long>(name: "PermissionsVersion", table: "IdentityRoles", type: "INTEGER", nullable: false, defaultValue: 0L);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "RolesVersion", table: "IdentityUsers");
        migrationBuilder.DropColumn(name: "PermissionsVersion", table: "IdentityRoles");
    }
}
