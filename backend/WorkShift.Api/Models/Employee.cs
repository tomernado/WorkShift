namespace WorkShift.Api.Models;

public record Employee
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string JobRole { get; init; } = "";   // "waiter" | "cook"
    public bool IsActive { get; init; } = true;
    public PermanentConstraint? PermanentConstraint { get; init; }
}
