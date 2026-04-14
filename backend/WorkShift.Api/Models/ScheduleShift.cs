using System.Text.Json.Serialization;

namespace WorkShift.Api.Models;

public record ScheduleShift
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string ScheduleId { get; init; } = "";
    public string? EmployeeId { get; init; }     // null = unfilled slot
    public int DayOfWeek { get; init; }
    public string ShiftType { get; init; } = "";

    [JsonPropertyName("is_conflict")]
    public bool IsConflict { get; init; }

    [JsonPropertyName("conflict_reason")]
    public string? ConflictReason { get; init; }
}
