using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

public class SchedulerService
{
    private static readonly string[] DayNames =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

    private static readonly string[] ShiftTypes = ["morning", "evening"];

    public List<ScheduleShift> Generate(
        DateOnly weekStart,
        List<Employee> employees,
        List<ShiftRequirement> requirements,
        Dictionary<string, ParsedConstraint> constraints)
    {
        var result = new List<ScheduleShift>();
        var shiftCounts = employees.ToDictionary(e => e.Id, _ => 0);

        // Build effective max per employee (permanent override or default 5)
        var maxShifts = employees.ToDictionary(
            e => e.Id,
            e => e.PermanentConstraint?.MaxShiftsPerWeek ?? 5);

        // Merge permanent cannot_work into weekly constraints
        var mergedConstraints = MergeConstraints(employees, constraints);

        for (int day = 0; day <= 5; day++)
        {
            var actualDate = weekStart.AddDays(day);

            foreach (var shiftType in ShiftTypes)
            {
                var req = requirements.FirstOrDefault(r =>
                              r.TargetDate == actualDate && r.ShiftType == shiftType)
                          ?? requirements.FirstOrDefault(r =>
                              r.TargetDate == null && r.DayOfWeek == day && r.ShiftType == shiftType);

                if (req == null) continue;

                var slotKey = $"{DayNames[day]}_{shiftType}";

                AssignRole(result, employees, mergedConstraints, shiftCounts, maxShifts,
                    "waiter", req.RequiredWaiters, day, shiftType, slotKey);
                AssignRole(result, employees, mergedConstraints, shiftCounts, maxShifts,
                    "cook", req.RequiredCooks, day, shiftType, slotKey);
            }
        }

        return result;
    }

    /// <summary>
    /// Merges permanent cannot_work slots into weekly constraints for each employee.
    /// </summary>
    private static Dictionary<string, ParsedConstraint> MergeConstraints(
        List<Employee> employees,
        Dictionary<string, ParsedConstraint> weekly)
    {
        var merged = new Dictionary<string, ParsedConstraint>(weekly);
        foreach (var emp in employees)
        {
            if (emp.PermanentConstraint == null || emp.PermanentConstraint.CannotWork.Count == 0)
                continue;

            if (merged.TryGetValue(emp.Id, out var existing))
            {
                merged[emp.Id] = existing with
                {
                    CannotWork = existing.CannotWork
                        .Union(emp.PermanentConstraint.CannotWork)
                        .Distinct()
                        .ToList()
                };
            }
            else
            {
                merged[emp.Id] = new ParsedConstraint
                {
                    CannotWork = emp.PermanentConstraint.CannotWork.ToList()
                };
            }
        }
        return merged;
    }

    private static void AssignRole(
        List<ScheduleShift> result,
        List<Employee> employees,
        Dictionary<string, ParsedConstraint> constraints,
        Dictionary<string, int> shiftCounts,
        Dictionary<string, int> maxShifts,
        string jobRole,
        int required,
        int day,
        string shiftType,
        string slotKey)
    {
        if (required <= 0) return;

        var eligible = employees
            .Where(e => e.JobRole == jobRole && e.IsActive)
            // Hard block: cannot_work (weekly + permanent merged)
            .Where(e => !constraints.TryGetValue(e.Id, out var c) || !c.CannotWork.Contains(slotKey))
            // Respect per-employee max shifts
            .Where(e => shiftCounts.GetValueOrDefault(e.Id, 0) < maxShifts.GetValueOrDefault(e.Id, 5))
            // No same-day double shift
            .Where(e => !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day && s.EmployeeId != null))
            // No evening→morning next-day
            .Where(e => shiftType != "morning" ||
                        !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day - 1 && s.ShiftType == "evening" && s.EmployeeId != null))
            // Priority: employees who haven't met their minimum yet come first
            .OrderBy(e =>
            {
                var min = e.PermanentConstraint?.MinShiftsPerWeek ?? 0;
                var current = shiftCounts.GetValueOrDefault(e.Id, 0);
                return current < min ? 0 : 1;  // 0 = high priority
            })
            .ThenBy(e => constraints.TryGetValue(e.Id, out var c) && c.PreferNot.Contains(slotKey) ? 1 : 0)
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
