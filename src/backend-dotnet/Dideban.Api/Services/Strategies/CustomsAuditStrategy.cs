namespace Dideban.Api.Services.Strategies;

public class CustomsAuditStrategy : IAuditDomainStrategy
{
    private readonly IReconciliationService _reconciliationService;
    public string DomainName => "CUSTOMS";

    public CustomsAuditStrategy(IReconciliationService reconciliationService)
    {
        _reconciliationService = reconciliationService;
    }

    public async Task<int> RunAuditAsync()
    {
        return await _reconciliationService.RunReconciliationAsync();
    }
}