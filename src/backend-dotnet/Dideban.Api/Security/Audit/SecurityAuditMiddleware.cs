using System.Security.Claims;

namespace Dideban.Api.Security.Audit;

public sealed class SecurityAuditMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, SecurityAuditStore audit)
    {
        await next(context);
        if (context.Response.StatusCode != StatusCodes.Status403Forbidden) return;
        var actor = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        // Store only the route path, never query parameters or request bodies.
        await audit.AppendAsync("Auth.AccessDenied", actor, context.Request.Path.Value,
            "Forbidden", context.TraceIdentifier, context.RequestAborted);
    }
}
