
using System.Net;
using Dideban.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

var apiKey = Environment.GetEnvironmentVariable(
    "IntelligenceEngine__RegistryApiKey"
);

var baseUrl = Environment.GetEnvironmentVariable(
    "IntelligenceEngine__BaseUrl"
);

if (string.IsNullOrWhiteSpace(apiKey) ||
    apiKey.Length < 32)
{
    Console.Error.WriteLine(
        "FAIL: IntelligenceEngine__RegistryApiKey is missing."
    );

    return 1;
}

baseUrl = string.IsNullOrWhiteSpace(baseUrl)
    ? "http://127.0.0.1:8000"
    : baseUrl;

if (!Uri.TryCreate(
        baseUrl,
        UriKind.Absolute,
        out var baseUri))
{
    Console.Error.WriteLine(
        "FAIL: Invalid IntelligenceEngine__BaseUrl."
    );

    return 1;
}

var settings = new Dictionary<string, string?>
{
    ["IntelligenceEngine:RegistryApiKey"] = apiKey,
    ["IntelligenceEngine:BaseUrl"] = baseUrl
};

IConfiguration configuration = new ConfigurationBuilder()
    .AddInMemoryCollection(settings)
    .Build();

using var httpClient = new HttpClient
{
    BaseAddress = baseUri,
    Timeout = TimeSpan.FromSeconds(10)
};

IIntelligenceServiceClient client =
    new IntelligenceServiceClient(
        httpClient,
        NullLogger<IntelligenceServiceClient>.Instance,
        configuration
    );

using var cancellation = new CancellationTokenSource(
    TimeSpan.FromSeconds(20)
);

try
{
    Console.WriteLine(
        "Checking .NET -> FastAPI Model Registry..."
    );

    var models = await client.GetRegistryModelsAsync(
        cancellation.Token
    );

    Console.WriteLine(
        $"PASS: Model list retrieved. Count = {models.Count}"
    );

    foreach (var model in models)
    {
        Console.WriteLine(
            $"Model: {model.ModelName}, " +
            $"Version: {model.Version}, " +
            $"Status: {model.Status}"
        );
    }

    var unknownModel = await client.GetRegistryModelAsync(
        "dideban_smoke_test_nonexistent_model",
        "0.0.0",
        cancellation.Token
    );

    if (unknownModel is not null)
    {
        Console.Error.WriteLine(
            "FAIL: Unknown model unexpectedly exists."
        );

        return 1;
    }

    Console.WriteLine(
        "PASS: Unknown model correctly returned null."
    );

    var events = await client.GetRegistryEventsAsync(
        "dideban_smoke_test_nonexistent_model",
        "0.0.0",
        cancellation.Token
    );

    if (events.Count != 0)
    {
        Console.Error.WriteLine(
            "FAIL: Unexpected events for unknown model."
        );

        return 1;
    }

    Console.WriteLine(
        "PASS: Unknown model events returned an empty list."
    );

    Console.WriteLine(
        "SUCCESS: .NET -> FastAPI Registry integration verified."
    );

    return 0;
}
catch (HttpRequestException ex)
{
    Console.Error.WriteLine(
        $"FAIL: HTTP error, status = " +
        $"{(int?)ex.StatusCode}, message = {ex.Message}"
    );

    return 1;
}
catch (Exception ex)
{
    Console.Error.WriteLine(
        $"FAIL: {ex.GetType().Name}: {ex.Message}"
    );

    return 1;
}
