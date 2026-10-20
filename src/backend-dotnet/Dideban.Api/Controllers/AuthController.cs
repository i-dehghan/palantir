using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dideban.Api.Services.Identity;
using Dideban.Api.Security.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IdentityAuthService auth, JwtTokenService tokens, SecurityAuditStore audit) : ControllerBase
{
    public sealed record LoginRequest(
        [Required, StringLength(128, MinimumLength = 1)] string UserName,
        [Required] string Password);

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.UserName) || string.IsNullOrEmpty(request.Password))
        {
            await audit.AppendAsync("Auth.LoginFailed", null, null, "InvalidCredentials", HttpContext.TraceIdentifier, ct);
            return Unauthorized(new { message = "Invalid credentials." });
        }
        var user = await auth.AuthenticateAsync(request.UserName, request.Password, ct);
        if (user is null)
        {
            await audit.AppendAsync("Auth.LoginFailed", null, null, "InvalidCredentials", HttpContext.TraceIdentifier, ct);
            return Unauthorized(new { message = "Invalid credentials." });
        }
        var (token, expires) = await tokens.IssueAsync(user, ct);
        await audit.AppendAsync("Auth.LoginSucceeded", user.Id.ToString(), user.Id.ToString(), "Success", HttpContext.TraceIdentifier, ct);
        return Ok(new { accessToken = token, expiresAtUtc = expires, tokenType = "Bearer" });
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me() => Ok(new {
        userId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        userName = User.Identity?.Name,
        roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value).ToArray()
    });
}
