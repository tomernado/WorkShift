using System.Text.Json.Serialization;

namespace WorkShift.Api.Models;

public record PermanentConstraint
{
    [JsonPropertyName("min_shifts_per_week")]
    public int MinShiftsPerWeek { get; init; } = 0;

    [JsonPropertyName("max_shifts_per_week")]
    public int MaxShiftsPerWeek { get; init; } = 5;

    [JsonPropertyName("cannot_work")]
    public List<string> CannotWork { get; init; } = [];
}
