using Microsoft.AspNetCore.Mvc;
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

    public record CreateEmployeeRequest(string Name, string JobRole);
}
