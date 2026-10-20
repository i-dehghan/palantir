namespace Dideban.Api.Domain.Identity;

public sealed class ApplicationRolePermission
{
    public Guid RoleId { get; set; }
    public ApplicationRole Role { get; set; } = null!;
    public Guid PermissionId { get; set; }
    public ApplicationPermission Permission { get; set; } = null!;
}
