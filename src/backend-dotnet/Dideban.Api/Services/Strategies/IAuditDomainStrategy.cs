namespace Dideban.Api.Services.Strategies
{
    public interface IAuditDomainStrategy
    {
        string DomainName { get; }
        Task<int> RunAuditAsync();
    }
}