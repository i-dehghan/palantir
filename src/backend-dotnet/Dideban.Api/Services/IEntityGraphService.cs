using Dideban.Api.Domain.Dtos;

namespace Dideban.Api.Services
{
    public interface IEntityGraphService
    {
        Task<CrossDomainEntityGraphDto> BuildEntityGraphAsync(string nationalId);
    }
}
