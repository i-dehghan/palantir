// Dideban.Api.Domain.Dtos.GraphProjectionRequestDto.cs
namespace Dideban.Api.Domain.Dtos;

public class GraphProjectionRequestDto
{
    public string TargetNationalId { get; set; } = string.Empty;
    public List<string> CustomsFields { get; set; } = new();
    public List<string> BankingFields { get; set; } = new();
    public List<string> TelecomFields { get; set; } = new();
}