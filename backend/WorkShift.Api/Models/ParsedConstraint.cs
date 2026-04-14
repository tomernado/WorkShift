using System.Text.Json.Serialization;

namespace WorkShift.Api.Models;

public record ParsedConstraint
{
    [JsonPropertyName("cannot_work")]
    public List<string> CannotWork { get; init; } = [];

    [JsonPropertyName("prefer_not")]
    public List<string> PreferNot { get; init; } = [];

    [JsonPropertyName("prefer")]
    public List<string> Prefer { get; init; } = [];

    [JsonPropertyName("notes")]
    public string Notes { get; init; } = "";
}
