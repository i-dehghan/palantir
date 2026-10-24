using Dideban.Api.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace Dideban.Api.Infrastructure.Identity.Migrations;

[DbContext(typeof(IdentityDbContext))]
[Migration("20261020121500_IdentitySecurityVersion")]
public sealed class IdentitySecurityVersion : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<long>(name: "SecurityVersion", table: "IdentityUsers",
            type: "INTEGER", nullable: false, defaultValue: 0L);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "SecurityVersion", table: "IdentityUsers");
}
