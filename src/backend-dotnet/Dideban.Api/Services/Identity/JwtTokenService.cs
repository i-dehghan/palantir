using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Dideban.Api.Services.Identity;

public sealed class JwtTokenService(IConfiguration configuration, IdentityDbContext db)
{
    public async Task<(string Token, DateTimeOffset ExpiresAtUtc)> IssueAsync(ApplicationUser user, CancellationToken ct)
    {
        var key = ReadKey(configuration);
        var issuer = configuration["IdentityJwt:Issuer"]!;
        var audience = configuration["IdentityJwt:Audience"]!;
        var now = DateTimeOffset.UtcNow;
        var expires = now.AddMinutes(15);
        var roles = await db.UserRoles.Where(ur => ur.UserId == user.Id)
            .Select(ur => ur.Role.Name).ToListAsync(ct);
        var claims = new List<Claim> {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.UserName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var credentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(issuer, audience, claims, now.UtcDateTime,
            expires.UtcDateTime, credentials);
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    public static byte[] ReadKey(IConfiguration config)
    {
        var encoded = config["IdentityJwt:SigningKeyBase64"];
        byte[] key;
        try { key = Convert.FromBase64String(encoded ?? ""); }
        catch (FormatException) { throw new InvalidOperationException("IdentityJwt:SigningKeyBase64 must be base64."); }
        if (key.Length < 32) throw new InvalidOperationException("JWT signing key must contain at least 32 random bytes.");
        if (string.IsNullOrWhiteSpace(config["IdentityJwt:Issuer"]) || string.IsNullOrWhiteSpace(config["IdentityJwt:Audience"]))
            throw new InvalidOperationException("IdentityJwt:Issuer and IdentityJwt:Audience are required.");
        return key;
    }
}
