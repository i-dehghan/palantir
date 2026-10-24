namespace Dideban.Api.Domain.Ontology;

public enum EntityType
{
    Person,           // شخص حقیقی یا دارنده کدملی
    Company,          // شرکت تجاری یا شناسه ملی حقوقی
    BankAccount,      // شماره حساب یا شبای بانکی
    CustomsDocument,  // ثبت سفارش یا اظهارنامه ترخیص
    TelecomEndpoint,  // خط تلفن همراه یا سیم‌کارت
    CellTower         // دکل مخابراتی یا سلول جغرافیایی
}

public class OntologyNode
{
    public string Id { get; set; } = string.Empty;
    public EntityType Type { get; set; }
    public string DisplayLabel { get; set; } = string.Empty;
    public int RiskScore { get; set; } = 50;
    public Dictionary<string, object> Properties { get; set; } = new();
}

public class OntologyEdge
{
    public string SourceId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Predicate { get; set; } = string.Empty; // TRANSFERRED_FUNDS, OWNS_SIM, IMPORTED_GOODS, CONNECTED_TO_TOWER
    public double Weight { get; set; } = 1.0;
    public DateTime? Timestamp { get; set; }
    public Dictionary<string, object> Metadata { get; set; } = new();
}

public class MultiHopDossierGraph
{
    public string RootEntityId { get; set; } = string.Empty;
    public int ExploredDepth { get; set; }
    public List<OntologyNode> Nodes { get; set; } = new();
    public List<OntologyEdge> Edges { get; set; } = new();
}