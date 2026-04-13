namespace WorkShift.Api.Models;

public record ShiftRequirement
{
    public int DayOfWeek { get; init; }          // 0=Sun … 5=Fri
    public string ShiftType { get; init; } = ""; // "morning" | "evening"
    public int RequiredWaiters { get; init; }
    public int RequiredCooks { get; init; }
    public DateOnly? TargetDate { get; init; }   // null = default for day_of_week
}
