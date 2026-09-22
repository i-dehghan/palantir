using Dideban.Api.Infrastructure.Data;
using Dideban.Api.Services;
using Dideban.Api.Services.Strategies;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddHttpClient();
// محاسبه مسیر دقیق ریشه مخزن (Dideban) بر اساس پوشه جاری
// Dideban.Api -> backend-dotnet -> src -> Dideban
var currentDir = new DirectoryInfo(builder.Environment.ContentRootPath);
var solutionRoot = currentDir.Parent?.Parent?.Parent?.FullName ?? builder.Environment.ContentRootPath;

var dataFolder = Path.Combine(solutionRoot, "data");
if (!Directory.Exists(dataFolder))
{
    Directory.CreateDirectory(dataFolder);
}

var dbPath = Path.Combine(dataFolder, "dideban_dev.db");
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
// چاپ مسیر دیتابیس در لاگ برای اطمینان
Console.WriteLine($"[Dideban SQLite Path]: {dbPath}");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddScoped<IForensicReportService, ForensicReportService>();
builder.Services.AddScoped<IPatternDetectionEngine, PatternDetectionEngine>();
builder.Services.AddScoped<IPalantirLinkTraversalEngine, PalantirLinkTraversalEngine>();
builder.Services.AddScoped<IEntityGraphService, EntityGraphService>();
builder.Services.AddScoped<IReconciliationService, ReconciliationService>();
builder.Services.AddScoped<IAuditDomainStrategy, CustomsAuditStrategy>();
builder.Services.AddScoped<IAuditDomainStrategy, BankingAuditStrategy>();
builder.Services.AddScoped<IAuditDomainStrategy, TelecomAuditStrategy>();
builder.Services.AddScoped<IForensicReportService, ForensicReportService>();
builder.Services.AddHttpClient<IIntelligenceServiceClient, IntelligenceServiceClient>(client =>
{
    client.BaseAddress = new Uri("http://localhost:8000");
    client.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});

var app = builder.Build();

app.UseCors("AllowAngular"); 

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthorization();
app.MapControllers();


using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.EnsureCreated();
}


app.UseResponseCompression();
app.Run();
