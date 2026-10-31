using Dideban.Api.Security;
using Dideban.Api.Security.Audit;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Dideban.Api.Domain.Identity;
using Dideban.Api.Infrastructure.Identity;
using Dideban.Api.Services.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Dideban.Api.Infrastructure.Data;
using Dideban.Api.Services;
using Dideban.Api.Services.Strategies;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Enter a JWT access token obtained from POST /api/auth/login."
    });

    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = new List<string>()
    });
});

builder.Services.AddHttpClient();

// Security audit store is isolated from operational and Identity databases.
builder.Services.AddSingleton<SecurityAuditStore>();

// Dideban.Api -> backend-dotnet -> src -> Dideban
var currentDir = new DirectoryInfo(
    builder.Environment.ContentRootPath
);

var solutionRoot =
    currentDir.Parent?.Parent?.Parent?.FullName
    ?? builder.Environment.ContentRootPath;

var dataFolder = Path.Combine(solutionRoot, "data");

if (!Directory.Exists(dataFolder))
{
    Directory.CreateDirectory(dataFolder);
}

var dbPath = Path.Combine(
    dataFolder,
    "dideban_dev.db"
);

var connectionString = $"Data Source={dbPath}";

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

Console.WriteLine($"[Dideban SQLite Path]: {dbPath}");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(
        builder.Configuration.GetConnectionString(
            "DefaultConnection"
        )
    )
);

builder.Services.AddScoped<
    IForensicReportService,
    ForensicReportService
>();

builder.Services.AddScoped<
    IPatternDetectionEngine,
    PatternDetectionEngine
>();

builder.Services.AddScoped<
    IPalantirLinkTraversalEngine,
    PalantirLinkTraversalEngine
>();

builder.Services.AddScoped<
    IEntityGraphService,
    EntityGraphService
>();

builder.Services.AddScoped<
    IReconciliationService,
    ReconciliationService
>();

builder.Services.AddScoped<
    IAuditDomainStrategy,
    CustomsAuditStrategy
>();

builder.Services.AddScoped<
    IAuditDomainStrategy,
    BankingAuditStrategy
>();

builder.Services.AddScoped<
    IAuditDomainStrategy,
    TelecomAuditStrategy
>();

builder.Services.AddScoped<
    ITransitPathCorrelatorService,
    TransitPathCorrelatorService
>();

builder.Services.AddScoped<
    IWaybillHistoricalCorrelationService,
    WaybillHistoricalCorrelationService
>();

builder.Services.AddScoped<
    IWhatIfSimulationService,
    WhatIfSimulationService
>();

builder.Services.AddHttpClient<
    IIntelligenceServiceClient,
    IntelligenceServiceClient
>(client =>
{
    var baseUrl = builder.Configuration[
        "IntelligenceEngine:BaseUrl"
    ];

    if (string.IsNullOrWhiteSpace(baseUrl))
    {
        throw new InvalidOperationException(
            "IntelligenceEngine:BaseUrl is not configured."
        );
    }

    client.BaseAddress = new Uri(
        baseUrl,
        UriKind.Absolute
    );

    client.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});

// Identity is stored separately from the operational AppDbContext.
var identityPath = builder.Configuration["Identity:DatabasePath"]
    ?? Environment.GetEnvironmentVariable("DIDEBAN_IDENTITY_DB_PATH")
    ?? Path.Combine(solutionRoot, "data", "dideban_identity.db");
identityPath = Path.GetFullPath(identityPath);
Directory.CreateDirectory(Path.GetDirectoryName(identityPath)!);
builder.Services.AddDbContext<IdentityDbContext>(options =>
    options.UseSqlite($"Data Source={identityPath}"));
builder.Services.AddScoped<IPasswordHasher<ApplicationUser>, PasswordHasher<ApplicationUser>>();
builder.Services.AddScoped<IdentityAuthService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<RefreshSessionService>();

var signingKey = JwtTokenService.ReadKey(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = true;
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var subject = context.Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? context.Principal?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
                var versionClaim = context.Principal?.FindFirst("security_version")?.Value;
                if (!Guid.TryParse(subject, out var userId) ||
                    !long.TryParse(versionClaim, System.Globalization.NumberStyles.None,
                        System.Globalization.CultureInfo.InvariantCulture, out var version))
                {
                    context.Fail("Invalid security session.");
                    return;
                }
                var db = context.HttpContext.RequestServices.GetRequiredService<IdentityDbContext>();
                var valid = await db.Users.AsNoTracking().AnyAsync(
                    u => u.Id == userId && u.IsActive && u.SecurityVersion == version,
                    context.HttpContext.RequestAborted);
                if (!valid) context.Fail("Security session revoked.");
            }
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["IdentityJwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["IdentityJwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(signingKey),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };
    });
builder.Services.AddAuthorization(options =>
{
    foreach (var code in RegistryPermissions.All)
        options.AddPolicy(code, policy => policy.RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(code)));
});
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();
await app.Services.GetRequiredService<SecurityAuditStore>().InitializeAsync();

app.UseCors("AllowAngular");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRateLimiter();
app.UseMiddleware<SecurityAuditMiddleware>();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider
        .GetRequiredService<AppDbContext>();

    dbContext.Database.EnsureCreated();
}

app.UseResponseCompression();

// Add missing permissions to the existing Identity database, and grant only to Admin.
using (var identityScope = app.Services.CreateScope())
{
    var identityDb = identityScope.ServiceProvider.GetRequiredService<IdentityDbContext>();
    await IdentityPermissionSeeder.SeedAsync(identityDb);
}

if (args.Contains("--bootstrap-admin", StringComparer.OrdinalIgnoreCase))
{
    Environment.ExitCode = await IdentityBootstrap.RunAsync(app.Services, app.Configuration);
    return;
}

app.Run();
