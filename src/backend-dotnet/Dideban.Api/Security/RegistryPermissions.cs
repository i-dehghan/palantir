namespace Dideban.Api.Security;

public static class RegistryPermissions
{
    public const string AuditRead = "Audit.Read";
    public const string AuditExecute = "Audit.Execute";
    public const string RulesRead = "Rules.Read";
    public const string RulesManage = "Rules.Manage";
    public const string RegistryRead = "Registry.Read";
    public static readonly string[] All = [AuditRead, AuditExecute, RulesRead, RulesManage, RegistryRead];
}
