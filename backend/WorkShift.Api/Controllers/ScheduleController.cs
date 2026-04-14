using Microsoft.AspNetCore.Mvc;
using WorkShift.Api.Services;

namespace WorkShift.Api.Controllers;

[ApiController]
[Route("api/schedule")]
public class ScheduleController : ControllerBase
{
    private readonly SchedulerService _scheduler;
    private readonly SupabaseService _db;

    public ScheduleController(SchedulerService scheduler, SupabaseService db)
    {
        _scheduler = scheduler;
        _db = db;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateRequest req)
    {
        if (!DateOnly.TryParse(req.WeekStart, out var weekStart))
            return BadRequest(new { error = "Invalid weekStart date format. Use yyyy-MM-dd." });

        var employees = await _db.GetActiveEmployeesAsync();
        var requirements = await _db.GetShiftRequirementsAsync();
        var constraints = await _db.GetApprovedConstraintsAsync(weekStart);

        var shifts = _scheduler.Generate(weekStart, employees, requirements, constraints);
        var scheduleId = await _db.UpsertScheduleAsync(weekStart);
        await _db.SaveShiftsAsync(scheduleId, shifts);

        return Ok(new
        {
            schedule_id = scheduleId,
            conflict_count = shifts.Count(s => s.IsConflict),
            shifts
        });
    }

    [HttpPatch("shifts/{id}")]
    public async Task<IActionResult> UpdateShift(string id, [FromBody] UpdateShiftRequest req)
    {
        if (string.IsNullOrWhiteSpace(id))
            return BadRequest(new { error = "shift id is required" });

        // Drag-and-drop: dayOfWeek + shiftType present
        if (req.ShiftType != null)
        {
            await _db.UpdateShiftAsync(id, req.DayOfWeek ?? 0, req.ShiftType);
        }

        // ShiftSlotPanel: notes / employee swap
        if (req.EmployeeId != null || req.EmployeeNote != null || req.ShiftNote != null)
        {
            await _db.PatchShiftDetailsAsync(
                id,
                req.EmployeeId,
                req.EmployeeNote,
                req.ShiftNote,
                req.ScheduleId,
                req.DayOfWeek,
                req.ShiftType);
        }

        return Ok();
    }

    [HttpPost("{scheduleId}/publish")]
    public async Task<IActionResult> Publish(string scheduleId)
    {
        if (string.IsNullOrWhiteSpace(scheduleId))
            return BadRequest(new { error = "scheduleId is required" });

        await _db.PublishScheduleAsync(scheduleId);
        return Ok();
    }

    public record GenerateRequest(string WeekStart);
    public record UpdateShiftRequest(
        int? DayOfWeek,
        string? ShiftType,
        string? EmployeeId,
        string? EmployeeNote,
        string? ShiftNote,
        string? ScheduleId);
}
