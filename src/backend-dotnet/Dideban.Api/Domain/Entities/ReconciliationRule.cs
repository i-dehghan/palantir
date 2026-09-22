namespace Dideban.Api.Domain.Entities
{
    public enum MatchingStrategy
    {
        Exact,            // تطابق دقیق متنی یا کدی (مثلا HS Code)
        NumericTolerance, // تلورانس عددی (مثلا اختلاف ارزش تا ۵٪)
        FuzzyText         // تطبیق هوشمند متنی در پایتون
    }

    public class ReconciliationRule
    {
        public int Id { get; set; }
        public string DomainType { get; set; } = "CUSTOMS"; // اضافه شد: CUSTOMS, BANKING, TELECOM
        public string RuleName { get; set; } = string.Empty;
        public string SourceTableA { get; set; } = string.Empty;   // مثلا ntsw_orders
        public string SourceFieldA { get; set; } = string.Empty;   // مثلا hs_code یا goods_description
        public string SourceTableB { get; set; } = string.Empty;   // مثلا epl_declarations
        public string SourceFieldB { get; set; } = string.Empty;   // مثلا declared_hs_code
        public MatchingStrategy Strategy { get; set; }
        public double ToleranceOrThreshold { get; set; }           // آستانه درصد یا ضریب شباهت (مثلا 0.85)
        public bool IsActive { get; set; } = true;
    }
}
