
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dideban.Api.DTOs;

namespace Dideban.Api.Services;

public interface IIntelligenceServiceClient
{
    Task<PythonCompareResponse?> CompareGoodsDescriptionsAsync(
        string orderText,
        string customsText
    );

    Task<IReadOnlyList<ModelRegistryVersionDto>> GetRegistryModelsAsync(
        CancellationToken cancellationToken = default
    );

    Task<ModelRegistryVersionDto?> GetRegistryModelAsync(
        string modelName,
        string version,
        CancellationToken cancellationToken = default
    );

    Task<IReadOnlyList<ModelRegistryEventDto>> GetRegistryEventsAsync(
        string modelName,
        string version,
        CancellationToken cancellationToken = default
    );
}

public class IntelligenceServiceClient : IIntelligenceServiceClient
{
    private const string RegistryBasePath =
        "/api/v1/model-registry/models";

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly ILogger<IntelligenceServiceClient> _logger;
    private readonly IConfiguration _configuration;

    public IntelligenceServiceClient(
        HttpClient httpClient,
        ILogger<IntelligenceServiceClient> logger,
        IConfiguration configuration
    )
    {
        _httpClient = httpClient;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task<PythonCompareResponse?>
        CompareGoodsDescriptionsAsync(
            string orderText,
            string customsText
        )
    {
        try
        {
            var payload = new PythonCompareRequest(
                orderText,
                customsText
            );

            using var response = await _httpClient.PostAsJsonAsync(
                "/api/v1/compare-text",
                payload
            );

            if (response.IsSuccessStatusCode)
            {
                return await response.Content
                    .ReadFromJsonAsync<PythonCompareResponse>();
            }

            _logger.LogWarning(
                "پایتون با وضعیت {StatusCode} پاسخ داد.",
                response.StatusCode
            );

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "خطا در برقراری ارتباط با میکروسرویس پایتون."
            );

            return null;
        }
    }

    public async Task<IReadOnlyList<ModelRegistryVersionDto>>
        GetRegistryModelsAsync(
            CancellationToken cancellationToken = default
        )
    {
        var models = await GetRegistryResponseAsync<
            List<ModelRegistryVersionDto>
        >(
            RegistryBasePath,
            cancellationToken
        );

        return models ?? new List<ModelRegistryVersionDto>();
    }

    public Task<ModelRegistryVersionDto?> GetRegistryModelAsync(
        string modelName,
        string version,
        CancellationToken cancellationToken = default
    )
    {
        return GetRegistryResponseAsync<ModelRegistryVersionDto>(
            BuildModelPath(modelName, version),
            cancellationToken
        );
    }

    public async Task<IReadOnlyList<ModelRegistryEventDto>>
        GetRegistryEventsAsync(
            string modelName,
            string version,
            CancellationToken cancellationToken = default
        )
    {
        var events = await GetRegistryResponseAsync<
            List<ModelRegistryEventDto>
        >(
            $"{BuildModelPath(modelName, version)}/events",
            cancellationToken
        );

        return events ?? new List<ModelRegistryEventDto>();
    }

    private static string BuildModelPath(
        string modelName,
        string version
    )
    {
        if (string.IsNullOrWhiteSpace(modelName))
        {
            throw new ArgumentException(
                "Model name is required.",
                nameof(modelName)
            );
        }

        if (string.IsNullOrWhiteSpace(version))
        {
            throw new ArgumentException(
                "Model version is required.",
                nameof(version)
            );
        }

        return $"{RegistryBasePath}/" +
               $"{Uri.EscapeDataString(modelName)}/" +
               $"{Uri.EscapeDataString(version)}";
    }

    private async Task<T?> GetRegistryResponseAsync<T>(
        string path,
        CancellationToken cancellationToken
    )
    {
        var apiKey = _configuration[
            "IntelligenceEngine:RegistryApiKey"
        ];

        if (string.IsNullOrWhiteSpace(apiKey) ||
            apiKey.Length < 32)
        {
            throw new InvalidOperationException(
                "Model Registry API key is not configured."
            );
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            path
        );

        request.Headers.TryAddWithoutValidation(
            "X-Registry-Key",
            apiKey
        );

        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return default;
        }

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Model Registry returned HTTP {StatusCode}.",
                (int)response.StatusCode
            );

            throw new HttpRequestException(
                $"Model Registry request failed: " +
                $"HTTP {(int)response.StatusCode}",
                null,
                response.StatusCode
            );
        }

        var result = await response.Content.ReadFromJsonAsync<T>(
            JsonOptions,
            cancellationToken
        );

        if (result is null)
        {
            throw new JsonException(
                "Model Registry returned an empty or null response."
            );
        }

        return result;
    }
}
