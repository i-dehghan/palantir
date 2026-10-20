using Dideban.Api.Security;
using Dideban.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/model-registry")]
[Authorize(Policy = RegistryPermissions.RegistryRead)]
public sealed class ModelRegistryController(IIntelligenceServiceClient intelligence, ILogger<ModelRegistryController> logger)
    : ControllerBase
{
    [HttpGet("models")]
    public async Task<IActionResult> GetModels(CancellationToken ct)
    {
        try { return Ok(await intelligence.GetRegistryModelsAsync(ct)); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Model Registry unavailable");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Model Registry unavailable." });
        }
    }

    [HttpGet("models/{modelName}/{version}")]
    public async Task<IActionResult> GetModel(string modelName, string version, CancellationToken ct)
    {
        try
        {
            var model = await intelligence.GetRegistryModelAsync(modelName, version, ct);
            return model is null ? NotFound() : Ok(model);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Model Registry unavailable");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Model Registry unavailable." });
        }
    }

    [HttpGet("models/{modelName}/{version}/events")]
    public async Task<IActionResult> GetEvents(string modelName, string version, CancellationToken ct)
    {
        try { return Ok(await intelligence.GetRegistryEventsAsync(modelName, version, ct)); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Model Registry unavailable");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Model Registry unavailable." });
        }
    }
}
