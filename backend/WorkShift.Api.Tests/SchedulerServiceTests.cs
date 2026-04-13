using WorkShift.Api.Models;
using WorkShift.Api.Services;
using Xunit;

namespace WorkShift.Api.Tests;

public class SchedulerServiceTests
{
    private readonly SchedulerService _svc = new();
    private static readonly DateOnly WeekStart = new(2026, 4, 19); // Sunday

    private static List<Employee> FiveEmployees() =>
    [
        new() { Id = "w1", JobRole = "waiter" },
        new() { Id = "w2", JobRole = "waiter" },
        new() { Id = "c1", JobRole = "cook" },
        new() { Id = "c2", JobRole = "cook" },
        new() { Id = "c3", JobRole = "cook" },
    ];

    private static List<ShiftRequirement> SundayMorning() =>
        [new() { DayOfWeek = 0, ShiftType = "morning", RequiredWaiters = 2, RequiredCooks = 3 }];

    [Fact]
    public void Generate_FillsAllSlots_WhenNoConstraints()
    {
        var shifts = _svc.Generate(WeekStart, FiveEmployees(), SundayMorning(), []);

        var slot = shifts.Where(s => s.DayOfWeek == 0 && s.ShiftType == "morning").ToList();
        Assert.Equal(5, slot.Count);
        Assert.All(slot, s => Assert.False(s.IsConflict));
    }

    [Fact]
    public void Generate_BlocksEmployee_WhenCannotWork()
    {
        var constraints = new Dictionary<string, ParsedConstraint>
        {
            ["w1"] = new() { CannotWork = ["sunday_morning"] }
        };

        var shifts = _svc.Generate(WeekStart, FiveEmployees(), SundayMorning(), constraints);

        Assert.DoesNotContain(shifts,
            s => s.EmployeeId == "w1" && s.DayOfWeek == 0 && s.ShiftType == "morning");
    }

    [Fact]
    public void Generate_MarksConflict_WhenUnderstaffed()
    {
        var twoOnly = new List<Employee>
        {
            new() { Id = "w1", JobRole = "waiter" },
            new() { Id = "c1", JobRole = "cook" },
        };

        var shifts = _svc.Generate(WeekStart, twoOnly, SundayMorning(), []);

        Assert.Contains(shifts, s => s.IsConflict && s.ConflictReason != null);
    }

    [Fact]
    public void Generate_RespectsMaxFiveShiftsPerWeek()
    {
        var requirements = Enumerable.Range(0, 6)
            .SelectMany(d => new[]
            {
                new ShiftRequirement { DayOfWeek = d, ShiftType = "morning", RequiredWaiters = 1, RequiredCooks = 0 },
                new ShiftRequirement { DayOfWeek = d, ShiftType = "evening", RequiredWaiters = 1, RequiredCooks = 0 },
            }).ToList();

        var shifts = _svc.Generate(WeekStart, [new() { Id = "w1", JobRole = "waiter" }], requirements, []);

        var assigned = shifts.Count(s => s.EmployeeId == "w1" && !s.IsConflict);
        Assert.True(assigned <= 5);
    }

    [Fact]
    public void Generate_NoEmployeeWorksMorningAndEveningOnSameDay()
    {
        var requirements = new List<ShiftRequirement>
        {
            new() { DayOfWeek = 0, ShiftType = "morning", RequiredWaiters = 1, RequiredCooks = 0 },
            new() { DayOfWeek = 0, ShiftType = "evening", RequiredWaiters = 1, RequiredCooks = 0 },
        };

        var shifts = _svc.Generate(WeekStart, [new() { Id = "w1", JobRole = "waiter" }], requirements, []);

        var day0Assignments = shifts.Where(s => s.EmployeeId == "w1" && s.DayOfWeek == 0 && !s.IsConflict).ToList();
        Assert.True(day0Assignments.Count <= 1, "Employee should not work both morning and evening same day");
    }

    [Fact]
    public void Generate_PrefersTargetDateRequirement_OverDayOfWeek()
    {
        var specificSunday = WeekStart; // day 0 = WeekStart date (2026-04-19)
        var requirements = new List<ShiftRequirement>
        {
            new() { DayOfWeek = 0, ShiftType = "morning", RequiredWaiters = 1, RequiredCooks = 0 },
            new() { DayOfWeek = 0, ShiftType = "morning", RequiredWaiters = 2, RequiredCooks = 0, TargetDate = specificSunday },
        };

        var shifts = _svc.Generate(WeekStart, FiveEmployees(), requirements, []);

        var filledWaiters = shifts.Count(s => s.DayOfWeek == 0 && s.ShiftType == "morning"
                                              && s.EmployeeId != null && !s.IsConflict);
        Assert.Equal(2, filledWaiters);
    }
}
