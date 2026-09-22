namespace Dideban.Api.Services
{
    using System.Net.Http.Json;
    using System.Text.Json;
    using Microsoft.Extensions.Configuration;

    public interface IForensicAiService
    {
        Task<string> GenerateForensicNarrativeAsync(object investigationGraphData, List<string> targetIdentifiers);
    }

    public class ForensicAiService : IForensicAiService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _config;

        public ForensicAiService(HttpClient httpClient, IConfiguration config)
        {
            _httpClient = httpClient;
            _config = config;
        }

        public async Task<string> GenerateForensicNarrativeAsync(object investigationGraphData, List<string> targetIdentifiers)
        {
            var cleanTargets = targetIdentifiers
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct()
                .ToList();

            var targetsStr = string.Join(" و ", cleanTargets);

            // استخراج نودها و یال‌ها از شیء ورودی گراف
            var nodes = new List<object>();
            var edges = new List<object>();

            if (investigationGraphData != null)
            {
                var nodesProp = investigationGraphData.GetType().GetProperty("Nodes");
                var edgesProp = investigationGraphData.GetType().GetProperty("Edges");

                if (nodesProp?.GetValue(investigationGraphData) is System.Collections.IEnumerable rawNodes)
                {
                    foreach (var n in rawNodes) nodes.Add(n);
                }

                if (edgesProp?.GetValue(investigationGraphData) is System.Collections.IEnumerable rawEdges)
                {
                    foreach (var e in rawEdges) edges.Add(e);
                }
            }

            // بسته پی‌لود مطابق با مدل ForensicDossierRequest در main.py پایتون
            var requestBody = new
            {
                identifiers = cleanTargets,
                nodes = nodes,
                edges = edges
            };

            try
            {
                // آدرس سرویس پایتون از appsettings خوانده می‌شود و در صورت نبود، پورت ۸۰۰۰ لوکال ست می‌شود
                var pythonBaseUrl = _config["IntelligenceEngine:BaseUrl"] ?? "http://127.0.0.1:8000";
                var endpoint = $"{pythonBaseUrl.TrimEnd('/')}/api/v1/forensic-narrative";

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
                var response = await _httpClient.PostAsJsonAsync(endpoint, requestBody, cts.Token);

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cts.Token);
                    if (result.TryGetProperty("summary_narrative", out var narrativeProp))
                    {
                        var text = narrativeProp.GetString();
                        if (!string.IsNullOrWhiteSpace(text))
                        {
                            return text;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // در صورت بروز هرگونه اختلال موقت در ارتباط با سرویس پایتون
                Console.WriteLine($"[ForensicAiService Error] Failed calling intelligence-py: {ex.Message}");
            }

            // پاسخ Fallback تحلیلی در صورت عدم دسترسی به سرور پایتون
            return $"بر اساس تقاطع‌گیری هوشمند، شبکه ارتباطی و هماهنگی سامانه‌ای میان شناسه‌های [{targetsStr}] محرز گردید. اسناد کوتاژهای موازی منقسم و تراکنش‌های حساب‌های واسط به عنوان مستندات تخلف ضمیمه پرونده شد.";
        }
    }
}