namespace Dideban.Api.Domain.Identity;

public sealed class ApplicationUserRole
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid RoleId { get; set; }
    public ApplicationRole Role { get; set; } = null!;
}
