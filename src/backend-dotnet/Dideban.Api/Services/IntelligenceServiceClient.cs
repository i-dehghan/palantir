using System.Net.Http.Json;
using Dideban.Api.DTOs;

namespace Dideban.Api.Services;

public interface IIntelligenceServiceClient
{
    Task<PythonCompareResponse?> CompareGoodsDescriptionsAsync(string orderText, string customsText);
}

public class IntelligenceServiceClient : IIntelligenceServiceClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<IntelligenceServiceClient> _logger;

    public IntelligenceServiceClient(HttpClient httpClient, ILogger<IntelligenceServiceClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<PythonCompareResponse?> CompareGoodsDescriptionsAsync(string orderText, string customsText)
    {
        try
        {
            var payload = new PythonCompareRequest(orderText, customsText);
            var response = await _httpClient.PostAsJsonAsync("/api/v1/compare-text", payload);

            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<PythonCompareResponse>();
            }

            _logger.LogWarning("پایتون با وضعیت {StatusCode} پاسخ داد.", response.StatusCode);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "خطا در برقراری ارتباط با میکروسرویس پایتون.");
            return null;
        }
    }
}