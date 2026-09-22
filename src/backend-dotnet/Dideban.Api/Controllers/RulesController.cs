using Dideban.Api.Domain.Entities;
using Dideban.Api.DTOs;
using Dideban.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RulesController : ControllerBase
{
    private readonly AppDbContext _context;

    public RulesController(AppDbContext context)
    {
        _context = context;
    }

    // ۱. دریافت تمام قوانین
    [HttpGet]
    public async Task<ActionResult<IEnumerable<RuleResponseDto>>> GetAllRules()
    {
        var rules = await _context.ReconciliationRules
            .AsNoTracking()
            .Select(r => new RuleResponseDto(
                r.Id,
                r.RuleName,
                r.SourceTableA,
                r.SourceFieldA,
                r.SourceTableB,
                r.SourceFieldB,
                r.Strategy,
                r.ToleranceOrThreshold,
                r.IsActive
            ))
            .ToListAsync();

        return Ok(rules);
    }

    // ۲. دریافت یک قانون بر اساس شناسه
    [HttpGet("{id:int}")]
    public async Task<ActionResult<RuleResponseDto>> GetRuleById(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);

        if (rule == null)
            return NotFound(new { message = $"قانون با شناسه {id} یافت نشد." });

        return Ok(new RuleResponseDto(
            rule.Id,
            rule.RuleName,
            rule.SourceTableA,
            rule.SourceFieldA,
            rule.SourceTableB,
            rule.SourceFieldB,
            rule.Strategy,
            rule.ToleranceOrThreshold,
            rule.IsActive
        ));
    }

    // ۳. تعریف قانون تطبیق جدید
    [HttpPost]
    public async Task<ActionResult<RuleResponseDto>> CreateRule([FromBody] CreateRuleDto dto)
    {
        var rule = new ReconciliationRule
        {
            RuleName = dto.RuleName,
            SourceTableA = dto.SourceTableA,
            SourceFieldA = dto.SourceFieldA,
            SourceTableB = dto.SourceTableB,
            SourceFieldB = dto.SourceFieldB,
            Strategy = dto.Strategy,
            ToleranceOrThreshold = dto.ToleranceOrThreshold,
            IsActive = true
        };

        _context.ReconciliationRules.Add(rule);
        await _context.SaveChangesAsync();

        var response = new RuleResponseDto(
            rule.Id,
            rule.RuleName,
            rule.SourceTableA,
            rule.SourceFieldA,
            rule.SourceTableB,
            rule.SourceFieldB,
            rule.Strategy,
            rule.ToleranceOrThreshold,
            rule.IsActive
        );

        return CreatedAtAction(nameof(GetRuleById), new { id = rule.Id }, response);
    }

    // ۴. ویرایش قانون موجود
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateRule(int id, [FromBody] UpdateRuleDto dto)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);

        if (rule == null)
            return NotFound(new { message = $"قانون با شناسه {id} یافت نشد." });

        rule.RuleName = dto.RuleName;
        rule.SourceTableA = dto.SourceTableA;
        rule.SourceFieldA = dto.SourceFieldA;
        rule.SourceTableB = dto.SourceTableB;
        rule.SourceFieldB = dto.SourceFieldB;
        rule.Strategy = dto.Strategy;
        rule.ToleranceOrThreshold = dto.ToleranceOrThreshold;
        rule.IsActive = dto.IsActive;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    // ۵. فعال/غیرفعال کردن سریع قانون (Toggle Status)
    [HttpPatch("{id:int}/toggle-status")]
    public async Task<IActionResult> ToggleRuleStatus(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);

        if (rule == null)
            return NotFound(new { message = $"قانون با شناسه {id} یافت نشد." });

        rule.IsActive = !rule.IsActive;
        await _context.SaveChangesAsync();

        return Ok(new { message = $"وضعیت قانون به {(rule.IsActive ? "فعال" : "غیرفعال")} تغییر یافت.", isActive = rule.IsActive });
    }

    // ۶. حذف قانون
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteRule(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);

        if (rule == null)
            return NotFound(new { message = $"قانون با شناسه {id} یافت نشد." });

        _context.ReconciliationRules.Remove(rule);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}