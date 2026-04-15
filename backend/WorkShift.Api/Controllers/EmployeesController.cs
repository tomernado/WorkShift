using Microsoft.AspNetCore.Mvc;
using WorkShift.Api.Models;
using WorkShift.Api.Services;

namespace WorkShift.Api.Controllers;

[ApiController]
[Route("api/employees")]
public class EmployeesController : ControllerBase
{
    private readonly SupabaseService _db;
    public EmployeesController(SupabaseService db) => _db = db;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.JobRole))
            return BadRequest(new { error = "name and jobRole are required" });
        if (req.JobRole != "waiter" && req.JobRole != "cook")
            return BadRequest(new { error = "jobRole must be 'waiter' or 'cook'" });

        var id = await _db.CreateEmployeeAsync(req.Name, req.JobRole);
        return Ok(new { id });
    }

    [HttpPut("{id}/password")]
    public async Task<IActionResult> UpdatePassword(string id, [FromBody] UpdatePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 4)
            return BadRequest(new { error = "password must be at least 4 characters" });

        try
        {
            await _db.UpdateEmployeePasswordAsync(id, req.Password);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("{id}/permanent-constraint")]
    public async Task<IActionResult> GetPermanentConstraint(string id)
    {
        var constraint = await _db.GetPermanentConstraintAsync(id);
        return Ok(constraint ?? new PermanentConstraint());
    }

    [HttpPut("{id}/permanent-constraint")]
    public async Task<IActionResult> SavePermanentConstraint(string id, [FromBody] PermanentConstraint constraint)
    {
        await _db.SavePermanentConstraintAsync(id, constraint);
        return NoContent();
    }

    public record CreateEmployeeRequest(string Name, string JobRole);
    public record UpdatePasswordRequest(string Password);
}
