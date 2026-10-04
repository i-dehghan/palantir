using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Dideban.Api.Infrastructure.Data;
using Dideban.Api.Domain.Entities;

namespace Dideban.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RulesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<RulesController> _logger;

    public RulesController(AppDbContext context, ILogger<RulesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAllRules()
    {
        var rules = await _context.ReconciliationRules
            .AsNoTracking()
            .OrderBy(r => r.Id)
            .ToListAsync();
        return Ok(rules);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetRuleById(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);
        if (rule == null)
            return NotFound(new { message = $"قاعده با شناسه {id} یافت نشد." });

        return Ok(rule);
    }

    [HttpPost]
    public async Task<IActionResult> CreateRule([FromBody] ReconciliationRule rule)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        _context.ReconciliationRules.Add(rule);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetRuleById), new { id = rule.Id }, rule);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateRule(int id, [FromBody] ReconciliationRule updated)
    {
        var existing = await _context.ReconciliationRules.FindAsync(id);
        if (existing == null)
            return NotFound(new { message = $"قاعده با شناسه {id} یافت نشد." });

        existing.RuleName = updated.RuleName;
        existing.SourceTableA = updated.SourceTableA;
        existing.SourceFieldA = updated.SourceFieldA;
        existing.SourceTableB = updated.SourceTableB;
        existing.SourceFieldB = updated.SourceFieldB;
        existing.Strategy = updated.Strategy;
        existing.ToleranceOrThreshold = updated.ToleranceOrThreshold;
        existing.IsActive = updated.IsActive;

        await _context.SaveChangesAsync();
        return Ok(existing);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRule(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);
        if (rule == null)
            return NotFound(new { message = $"قاعده با شناسه {id} یافت نشد." });

        _context.ReconciliationRules.Remove(rule);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id}/toggle-status")]
    public async Task<IActionResult> ToggleStatus(int id)
    {
        var rule = await _context.ReconciliationRules.FindAsync(id);
        if (rule == null)
            return NotFound(new { message = $"قاعده با شناسه {id} یافت نشد." });

        rule.IsActive = !rule.IsActive;
        await _context.SaveChangesAsync();

        return Ok(new { id = rule.Id, isActive = rule.IsActive });
    }
}