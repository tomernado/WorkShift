using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

public class SchedulerService
{
    private static readonly string[] DayNames =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

    private static readonly string[] ShiftTypes = ["morning", "evening"];

    /// <summary>
    /// Pure function — no I/O. Returns list of ScheduleShift (including unfilled conflict slots).
    /// </summary>
    public List<ScheduleShift> Generate(
        DateOnly weekStart,
        List<Employee> employees,
        List<ShiftRequirement> requirements,
        Dictionary<string, ParsedConstraint> constraints)  // key = employee_id
    {
        var result = new List<ScheduleShift>();
        var shiftCounts = employees.ToDictionary(e => e.Id, _ => 0);

        for (int day = 0; day <= 5; day++)
        {
            var actualDate = weekStart.AddDays(day);

            foreach (var shiftType in ShiftTypes)
            {
                // target_date override takes precedence over day_of_week default
                var req = requirements.FirstOrDefault(r =>
                              r.TargetDate == actualDate && r.ShiftType == shiftType)
                          ?? requirements.FirstOrDefault(r =>
                              r.TargetDate == null && r.DayOfWeek == day && r.ShiftType == shiftType);

                if (req == null) continue;

                var slotKey = $"{DayNames[day]}_{shiftType}";

                AssignRole(result, employees, constraints, shiftCounts,
                    "waiter", req.RequiredWaiters, day, shiftType, slotKey);
                AssignRole(result, employees, constraints, shiftCounts,
                    "cook", req.RequiredCooks, day, shiftType, slotKey);
            }
        }

        return result;
    }

    private static void AssignRole(
        List<ScheduleShift> result,
        List<Employee> employees,
        Dictionary<string, ParsedConstraint> constraints,
        Dictionary<string, int> shiftCounts,
        string jobRole,
        int required,
        int day,
        string shiftType,
        string slotKey)
    {
        if (required <= 0) return;

        var eligible = employees
            .Where(e => e.JobRole == jobRole && e.IsActive)
            // Hard block: cannot_work
            .Where(e => !constraints.TryGetValue(e.Id, out var c) || !c.CannotWork.Contains(slotKey))
            // Max 5 shifts per week
            .Where(e => shiftCounts.GetValueOrDefault(e.Id, 0) < 5)
            // No same-day double shift (8h rest rule)
            .Where(e => !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day && s.EmployeeId != null))
            // No evening→morning next-day (8h rest rule)
            .Where(e => shiftType != "morning" ||
                        !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day - 1 && s.ShiftType == "evening" && s.EmployeeId != null))
            // Rotation fairness: prefer fewer shifts assigned, deprioritize prefer_not
            .OrderBy(e => constraints.TryGetValue(e.Id, out var c) && c.PreferNot.Contains(slotKey) ? 1 : 0)
            .ThenBy(e => shiftCounts.GetValueOrDefault(e.Id, 0))
            .ToList();

        int assigned = 0;
        foreach (var emp in eligible)
        {
            if (assigned >= required) break;

            bool isPreferNot = constraints.TryGetValue(emp.Id, out var con)
                               && con.PreferNot.Contains(slotKey);

            result.Add(new ScheduleShift
            {
                EmployeeId = emp.Id,
                DayOfWeek = day,
                ShiftType = shiftType,
                IsConflict = isPreferNot,
                ConflictReason = isPreferNot
                    ? $"{emp.Id} ביקש לא לעבוד במשמרת זו"
                    : null
            });
            shiftCounts[emp.Id]++;
            assigned++;
        }

        // Unfilled slots
        if (assigned < required)
        {
            var missing = required - assigned;
            var reason = $"חסר כוח אדם: נדרש {required} {jobRole}, מולאו {assigned}, חסרים {missing}";
            for (int i = 0; i < missing; i++)
            {
                result.Add(new ScheduleShift
                {
                    EmployeeId = null,
                    DayOfWeek = day,
                    ShiftType = shiftType,
                    IsConflict = true,
                    ConflictReason = reason
                });
            }
        }
    }
}
