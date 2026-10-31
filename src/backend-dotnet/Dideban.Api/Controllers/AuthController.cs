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
public sealed class AuthController(IdentityAuthService auth, JwtTokenService tokens, RefreshSessionService sessions, SecurityAuditStore audit) : ControllerBase
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
        var (refresh, token, _) = await sessions.CreateAsync(user, ct);
        SetRefreshCookie(refresh);
        var expires = DateTimeOffset.UtcNow.AddMinutes(15);
        await audit.AppendAsync("Auth.LoginSucceeded", user.Id.ToString(), user.Id.ToString(), "Success", HttpContext.TraceIdentifier, ct);
        return Ok(new { accessToken = token, expiresAtUtc = expires, tokenType = "Bearer" });
    }

    private const string CookieName = "__Host-dideban-refresh";

    private void SetRefreshCookie(string token) => Response.Cookies.Append(CookieName, token,
        new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict,
            Path = "/", Expires = DateTimeOffset.UtcNow.AddDays(7) });

    private void DeleteRefreshCookie() => Response.Cookies.Delete(CookieName,
        new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict, Path = "/" });

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        if (!Request.Cookies.TryGetValue(CookieName, out var token) || string.IsNullOrEmpty(token)) return Unauthorized();
        var result = await sessions.RotateAsync(token, ct);
        if (result is null) { DeleteRefreshCookie(); return Unauthorized(); }
        SetRefreshCookie(result.Value.Token);
        return Ok(new { accessToken = result.Value.AccessToken, expiresAtUtc = result.Value.AccessExpires, tokenType = "Bearer" });
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        if (Request.Cookies.TryGetValue(CookieName, out var token) && !string.IsNullOrEmpty(token))
            await sessions.RevokeAsync(token, ct);
        DeleteRefreshCookie();
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me() => Ok(new {
        userId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        userName = User.Identity?.Name,
        roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value).ToArray()
    });
}
