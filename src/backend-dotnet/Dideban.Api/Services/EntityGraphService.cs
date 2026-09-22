using Dideban.Api.Domain.Dtos;
using Dideban.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Services
{
    public class EntityGraphService : IEntityGraphService
    {
        private readonly AppDbContext _context;

        public EntityGraphService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<CrossDomainEntityGraphDto> BuildCustomProjectedGraphAsync(
    string nationalId,
    GraphProjectionRequestDto request)
        {
            var result = new CrossDomainEntityGraphDto { TargetNationalId = nationalId };
            var nodeMap = new Dictionary<string, GraphNodeDto>();

            var rootNodeId = $"PERSON_{nationalId}";
            nodeMap[rootNodeId] = new GraphNodeDto
            {
                Id = rootNodeId,
                Label = $"کد ملی: {nationalId}",
                Category = "PERSON",
                RiskScore = 95
            };

            // ۱. پردازش ستون‌های انتخابی بانکی
            if (request.BankingFields.Any())
            {
                var bankRows = await _context.Database.SqlQueryRaw<BankRow>(@"
            SELECT source_account AS SourceAcc, dest_account AS DestAcc, amount_irr AS Amount, transaction_rrn AS Rrn
            FROM bank_transactions WHERE customer_national_id = {0} LIMIT 15", nationalId).ToListAsync();

                foreach (var row in bankRows)
                {
                    var srcAccNodeId = $"ACC_{row.SourceAcc}";
                    if (request.BankingFields.Contains("sourceAccount") && !nodeMap.ContainsKey(srcAccNodeId))
                    {
                        nodeMap[srcAccNodeId] = new GraphNodeDto { Id = srcAccNodeId, Label = row.SourceAcc, Category = "BANK_ACCOUNT" };
                        result.Edges.Add(new GraphEdgeDto { Source = rootNodeId, Target = srcAccNodeId, Relation = "صاحب حساب" });
                    }

                    var destAccNodeId = $"MULE_{row.DestAcc}";
                    if (request.BankingFields.Contains("destAccount") && !nodeMap.ContainsKey(destAccNodeId))
                    {
                        nodeMap[destAccNodeId] = new GraphNodeDto { Id = destAccNodeId, Label = row.DestAcc, Category = "MULE_ACCOUNT" };

                        string label = "انتقال وجه";
                        if (request.BankingFields.Contains("amount"))
                            label += $" ({(row.Amount / 10):N0} تومان)";
                        if (request.BankingFields.Contains("rrn"))
                            label += $" [پیگیری: {row.Rrn}]";

                        result.Edges.Add(new GraphEdgeDto { Source = srcAccNodeId, Target = destAccNodeId, Relation = label });
                    }
                }
            }

            // ۲. پردازش ستون‌های انتخابی مخابرات
            if (request.TelecomFields.Any())
            {
                var telRows = await _context.Database.SqlQueryRaw<TelRow>(@"
            SELECT caller_msisdn AS Msisdn, receiver_msisdn AS Contact, duration_seconds AS Duration, cell_id AS CellId
            FROM telecom_cdrs WHERE caller_national_id = {0} LIMIT 15", nationalId).ToListAsync();

                foreach (var row in telRows)
                {
                    var phoneNodeId = $"TEL_{row.Msisdn}";
                    if (request.TelecomFields.Contains("callerMsisdn") && !nodeMap.ContainsKey(phoneNodeId))
                    {
                        var props = new Dictionary<string, string>();
                        if (request.TelecomFields.Contains("cellId")) props["دکل"] = row.CellId;

                        nodeMap[phoneNodeId] = new GraphNodeDto { Id = phoneNodeId, Label = row.Msisdn, Category = "MOBILE", Properties = props };
                        result.Edges.Add(new GraphEdgeDto { Source = rootNodeId, Target = phoneNodeId, Relation = "سیم‌کارت فعال" });
                    }

                    var contactNodeId = $"CONTACT_{row.Contact}";
                    if (request.TelecomFields.Contains("receiverMsisdn") && !nodeMap.ContainsKey(contactNodeId))
                    {
                        nodeMap[contactNodeId] = new GraphNodeDto { Id = contactNodeId, Label = row.Contact, Category = "CONTACT" };
                        string edgeDetail = request.TelecomFields.Contains("duration") ? $"{row.Duration} ثانیه" : "تماس";
                        result.Edges.Add(new GraphEdgeDto { Source = phoneNodeId, Target = contactNodeId, Relation = edgeDetail });
                    }
                }
            }

            result.Nodes = nodeMap.Values.ToList();
            return result;
        }

        private class BankRow { public string SourceAcc { get; set; } public string DestAcc { get; set; } public long Amount { get; set; } public string Rrn { get; set; } }
        private class TelRow { public string Msisdn { get; set; } public string Contact { get; set; } public int Duration { get; set; } public string CellId { get; set; } }

        public async Task<CrossDomainEntityGraphDto> BuildEntityGraphAsync(string nationalId)
        {
            var result = new CrossDomainEntityGraphDto { TargetNationalId = nationalId };
            var nodeMap = new Dictionary<string, GraphNodeDto>();

            // ۱. افزودن گره مرکزی: فرد مورد نظر
            var rootNodeId = $"PERSON_{nationalId}";
            nodeMap[rootNodeId] = new GraphNodeDto
            {
                Id = rootNodeId,
                Label = $"کد ملی: {nationalId}",
                Category = "PERSON",
                RiskScore = 95,
                Properties = new() { { "نقش", "ذی‌نفع / مظنون مرکزی" } }
            };

            // ۲. واکشی داده‌های مخابرات (Telecom): شماره همراه فرد و تماس‌های پرتکرار/مشکوک
            var telecomRecords = await _context.Database.SqlQueryRaw<TelecomSummary>(@"
            SELECT caller_msisdn AS Msisdn, receiver_msisdn AS ContactMsisdn, cell_id AS CellId, duration_seconds AS Duration
            FROM telecom_cdrs
            WHERE caller_national_id = {0}
            LIMIT 10
        ", nationalId).ToListAsync();

            foreach (var tel in telecomRecords)
            {
                var phoneNodeId = $"PHONE_{tel.Msisdn}";
                var contactNodeId = $"CONTACT_{tel.ContactMsisdn}";

                // گره خط شخصی
                if (!nodeMap.ContainsKey(phoneNodeId))
                {
                    nodeMap[phoneNodeId] = new GraphNodeDto
                    {
                        Id = phoneNodeId,
                        Label = $"خط: {tel.Msisdn}",
                        Category = "MOBILE",
                        Properties = new() { { "دکل", tel.CellId } }
                    };
                    result.Edges.Add(new GraphEdgeDto { Source = rootNodeId, Target = phoneNodeId, Relation = "مالکیت سیم‌کارت" });
                }

                // گره مخاطب
                if (!nodeMap.ContainsKey(contactNodeId))
                {
                    nodeMap[contactNodeId] = new GraphNodeDto
                    {
                        Id = contactNodeId,
                        Label = $"مخاطب: {tel.ContactMsisdn}",
                        Category = "CONTACT",
                        Properties = new() { { "مدت تماس", $"{tel.Duration} ثانیه" } }
                    };
                    result.Edges.Add(new GraphEdgeDto { Source = phoneNodeId, Target = contactNodeId, Relation = "مکالمه / ارتباط", Detail = $"{tel.Duration}s" });
                }
            }

            // ۳. واکشی داده‌های بانکی (Banking): حساب‌های فرد، مبالغ و حساب‌های مقصد
            var bankRecords = await _context.Database.SqlQueryRaw<BankSummary>(@"
            SELECT source_account AS SourceAcc, dest_account AS DestAcc, amount_irr AS Amount, transaction_type AS TxType
            FROM bank_transactions
            WHERE customer_national_id = {0}
            LIMIT 10
        ", nationalId).ToListAsync();

            foreach (var b in bankRecords)
            {
                var srcAccNodeId = $"ACC_{b.SourceAcc}";
                var destAccNodeId = $"ACC_{b.DestAcc}";

                if (!nodeMap.ContainsKey(srcAccNodeId))
                {
                    nodeMap[srcAccNodeId] = new GraphNodeDto
                    {
                        Id = srcAccNodeId,
                        Label = $"حساب: {b.SourceAcc}",
                        Category = "BANK_ACCOUNT",
                        Properties = new() { { "نوع", "حساب مبدأ شخصی" } }
                    };
                    result.Edges.Add(new GraphEdgeDto { Source = rootNodeId, Target = srcAccNodeId, Relation = "صاحب حساب" });
                }

                if (!nodeMap.ContainsKey(destAccNodeId))
                {
                    nodeMap[destAccNodeId] = new GraphNodeDto
                    {
                        Id = destAccNodeId,
                        Label = $"مقصد: {b.DestAcc}",
                        Category = "MULE_ACCOUNT",
                        Properties = new() { { "مبلغ", $"{(b.Amount / 10):N0} تومان" } }
                    };
                    result.Edges.Add(new GraphEdgeDto
                    {
                        Source = srcAccNodeId,
                        Target = destAccNodeId,
                        Relation = "انتقال وجه",
                        Detail = $"{(b.Amount / 10):N0} ت ({b.TxType})"
                    });
                }
            }

            // ۴. واکشی داده‌های گمرکی (Customs): ثبت‌سفارش‌ها و کوتاژهای واردات
            var customsRecords = await _context.Database.SqlQueryRaw<CustomsSummary>(@"
            SELECT order_reg_number AS OrderNo, total_usd AS ValUsd, goods_description AS Goods
            FROM ntsw_orders
            WHERE importer_national_id = {0}
            LIMIT 10
        ", nationalId).ToListAsync();

            foreach (var c in customsRecords)
            {
                var docNodeId = $"DOC_{c.OrderNo}";
                if (!nodeMap.ContainsKey(docNodeId))
                {
                    nodeMap[docNodeId] = new GraphNodeDto
                    {
                        Id = docNodeId,
                        Label = $"سند: {c.OrderNo}",
                        Category = "CUSTOMS_DOC",
                        Properties = new() { { "شرح کالا", c.Goods }, { "ارزش", $"${c.ValUsd:N0}" } }
                    };
                    result.Edges.Add(new GraphEdgeDto { Source = rootNodeId, Target = docNodeId, Relation = "ثبت‌سفارش کالا", Detail = $"${c.ValUsd:N0}" });
                }
            }

            result.Nodes = nodeMap.Values.ToList();
            return result;
        }

        private class TelecomSummary { public string Msisdn { get; set; } public string ContactMsisdn { get; set; } public string CellId { get; set; } public int Duration { get; set; } }
        private class BankSummary { public string SourceAcc { get; set; } public string DestAcc { get; set; } public long Amount { get; set; } public string TxType { get; set; } }
        private class CustomsSummary { public string OrderNo { get; set; } public double ValUsd { get; set; } public string Goods { get; set; } }
    }
}
