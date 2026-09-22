namespace Dideban.Api.Domain.Entities;

public class BomDefinition
{
    public int Id { get; set; }
    public string FinishedGoodName { get; set; } = string.Empty; // نام محصول نهایی (مثلا یخچال فریزر)
    public string FinishedGoodHsCode { get; set; } = string.Empty; // تعرفه محصول کامل (مثلا 84182100)
    public string PartHsCode { get; set; } = string.Empty; // تعرفه قطعه کلیدی (مثلا کمپرسور 84143000)
    public string PartName { get; set; } = string.Empty; // نام قطعه
    public bool IsEssential { get; set; } = true; // آیا قطعه حیاتی است؟
}