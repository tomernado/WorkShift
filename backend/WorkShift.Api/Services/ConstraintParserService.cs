using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

/// <summary>
/// Stub — full implementation in a later task.
/// </summary>
public class ConstraintParserService
{
    public Task<Dictionary<string, ParsedConstraint>> ParseAsync(string scheduleId)
        => Task.FromResult(new Dictionary<string, ParsedConstraint>());
}
