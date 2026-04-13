# WorkShift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack employee scheduling app with AI constraint parsing, auto-schedule generation, and drag-and-drop manager overrides.

**Architecture:** Monorepo — Supabase handles PostgreSQL + Auth; .NET 8 Web API runs the scheduling algorithm and Claude AI parsing; React SPA serves both employee and manager dashboards, reading data directly from Supabase and calling the .NET API only for AI parsing and schedule generation.

**Tech Stack:** React 18 + Vite + MUI v5 + @hello-pangea/dnd + @supabase/supabase-js v2 + date-fns | .NET 8 Web API + xUnit + Moq | Supabase PostgreSQL + Auth | Anthropic Claude API

---

## File Map

### Database
| File | Responsibility |
|------|---------------|
| `database/migrations/001_schema.sql` | All tables + indexes |
| `database/migrations/002_rls.sql` | Row Level Security policies |
| `database/seed.sql` | Default shift requirements + manager seed |

### Backend
| File | Responsibility |
|------|---------------|
| `backend/WorkShift.Api/Program.cs` | DI wiring, CORS, route mapping |
| `backend/WorkShift.Api/Models/Employee.cs` | Employee record |
| `backend/WorkShift.Api/Models/ParsedConstraint.cs` | AI output + constraint JSON shape |
| `backend/WorkShift.Api/Models/ShiftRequirement.cs` | Per-day staffing requirements |
| `backend/WorkShift.Api/Models/ScheduleShift.cs` | Single assigned shift |
| `backend/WorkShift.Api/Services/SchedulerService.cs` | Greedy rotation algorithm (pure, no I/O) |
| `backend/WorkShift.Api/Services/ConstraintParserService.cs` | Claude API call → ParsedConstraint |
| `backend/WorkShift.Api/Services/SupabaseService.cs` | All Supabase reads/writes |
| `backend/WorkShift.Api/Controllers/ConstraintsController.cs` | POST /api/constraints/parse |
| `backend/WorkShift.Api/Controllers/ScheduleController.cs` | POST /api/schedule/generate, PATCH /api/schedule/shifts/:id |
| `backend/WorkShift.Api.Tests/SchedulerServiceTests.cs` | Unit tests for algorithm |
| `backend/WorkShift.Api.Tests/ConstraintParserServiceTests.cs` | Unit tests for parser (mocked HTTP) |

### Frontend
| File | Responsibility |
|------|---------------|
| `frontend/src/lib/supabase.ts` | Supabase client singleton |
| `frontend/src/types/index.ts` | Shared TypeScript types |
| `frontend/src/App.tsx` | Router + auth guard |
| `frontend/src/pages/LoginPage.tsx` | Name dropdown + password login |
| `frontend/src/pages/EmployeeDashboard.tsx` | Employee shell with tabs |
| `frontend/src/pages/ManagerDashboard.tsx` | Manager shell with tabs |
| `frontend/src/components/schedule/WeeklyGrid.tsx` | Read-only published schedule grid |
| `frontend/src/components/constraints/ConstraintEditor.tsx` | Chip grid to correct AI output |
| `frontend/src/components/manager/EmployeeTable.tsx` | CRUD table |
| `frontend/src/components/manager/ShiftRequirementsGrid.tsx` | Inline-edit staffing grid |
| `frontend/src/components/manager/DraggableScheduleGrid.tsx` | D&D schedule with conflict highlights |

---

## Task 1: Monorepo & Git Init

**Files:**
- Create: `.gitignore`
- Create: `frontend/.env.example`

- [ ] **Step 1: Create folder structure and .gitignore**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git init
mkdir -p database/migrations frontend/src backend docs/superpowers/plans docs/superpowers/specs
```

Create `.gitignore`:
```gitignore
# .NET
backend/*/bin/
backend/*/obj/
backend/**/*.user
*.DotSettings.user

# Node
frontend/node_modules/
frontend/dist/
frontend/.env

# Misc
.DS_Store
*.log
```

- [ ] **Step 2: Create frontend env example**

Create `frontend/.env.example`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:5000
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore frontend/.env.example
git commit -m "chore: init monorepo structure"
```

---

## Task 2: Database Schema

**Files:**
- Create: `database/migrations/001_schema.sql`
- Create: `database/migrations/002_rls.sql`
- Create: `database/seed.sql`

- [ ] **Step 1: Write schema migration**

Create `database/migrations/001_schema.sql`:
```sql
-- profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('employee', 'manager')),
  job_role text check (job_role in ('waiter', 'cook')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- shift_requirements (target_date overrides day_of_week for special events)
create table public.shift_requirements (
  id uuid primary key default gen_random_uuid(),
  day_of_week int check (day_of_week between 0 and 5),
  shift_type text not null check (shift_type in ('morning', 'evening')),
  required_waiters int not null default 2,
  required_cooks int not null default 3,
  target_date date,
  unique nulls not distinct (day_of_week, shift_type, target_date)
);

-- constraints (one per employee per week)
create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  raw_text text not null,
  parsed_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

-- schedules (one per week)
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

-- schedule_shifts
create table public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  employee_id uuid references public.profiles(id),  -- nullable for UNFILLED slots
  day_of_week int not null check (day_of_week between 0 and 5),
  shift_type text not null check (shift_type in ('morning', 'evening')),
  is_conflict boolean not null default false,
  conflict_reason text
);

-- auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'employee');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Write RLS policies**

Create `database/migrations/002_rls.sql`:
```sql
alter table public.profiles enable row level security;
alter table public.constraints enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_shifts enable row level security;
alter table public.shift_requirements enable row level security;

create or replace function public.current_user_role()
returns text language sql security definer stable
as $$ select role from public.profiles where id = auth.uid() $$;

-- profiles: all authenticated users read active profiles
create policy "profiles_read" on public.profiles
  for select using (is_active = true);
create policy "profiles_manager_all" on public.profiles
  for all using (public.current_user_role() = 'manager');

-- constraints: own row or manager
create policy "constraints_own_or_manager" on public.constraints
  for all using (employee_id = auth.uid() or public.current_user_role() = 'manager');

-- schedules: published = everyone; draft = manager only
create policy "schedules_read" on public.schedules
  for select using (status = 'published' or public.current_user_role() = 'manager');
create policy "schedules_manager_write" on public.schedules
  for all using (public.current_user_role() = 'manager');

-- schedule_shifts follow parent schedule visibility
create policy "shifts_read" on public.schedule_shifts
  for select using (
    exists (
      select 1 from public.schedules s
      where s.id = schedule_id
        and (s.status = 'published' or public.current_user_role() = 'manager')
    )
  );
create policy "shifts_manager_write" on public.schedule_shifts
  for all using (public.current_user_role() = 'manager');

-- shift_requirements: all read, manager write
create policy "req_read" on public.shift_requirements for select using (true);
create policy "req_manager_write" on public.shift_requirements
  for all using (public.current_user_role() = 'manager');
```

- [ ] **Step 3: Write seed data**

Create `database/seed.sql`:
```sql
-- Default shift requirements: Sun(0)–Fri(5), morning + evening, 2 waiters + 3 cooks
insert into public.shift_requirements (day_of_week, shift_type, required_waiters, required_cooks)
values
  (0,'morning',2,3),(0,'evening',2,3),
  (1,'morning',2,3),(1,'evening',2,3),
  (2,'morning',2,3),(2,'evening',2,3),
  (3,'morning',2,3),(3,'evening',2,3),
  (4,'morning',2,3),(4,'evening',2,3),
  (5,'morning',2,3),(5,'evening',2,3);

-- NOTE: Manager user must be created first via Supabase Auth dashboard or API.
-- After creation, update the auto-created profile:
-- UPDATE public.profiles SET role='manager', name='מנהל' WHERE id='<auth-uuid>';
```

- [ ] **Step 4: Apply in Supabase SQL Editor**

In Supabase dashboard → SQL Editor:
1. Run `001_schema.sql`
2. Run `002_rls.sql`
3. Run `seed.sql`

- [ ] **Step 5: Commit**

```bash
git add database/
git commit -m "feat: database schema + RLS policies + seed"
```

---

## Task 3: Backend Project Setup

**Files:**
- Create: `backend/WorkShift.sln`
- Create: `backend/WorkShift.Api/WorkShift.Api.csproj`
- Create: `backend/WorkShift.Api/Program.cs`
- Create: `backend/WorkShift.Api/appsettings.Development.json`
- Create: `backend/WorkShift.Api.Tests/WorkShift.Api.Tests.csproj`

- [ ] **Step 1: Scaffold solution**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet new webapi -n WorkShift.Api --no-openapi
dotnet new xunit -n WorkShift.Api.Tests
dotnet new sln -n WorkShift
dotnet sln add WorkShift.Api/WorkShift.Api.csproj
dotnet sln add WorkShift.Api.Tests/WorkShift.Api.Tests.csproj
cd WorkShift.Api.Tests
dotnet add reference ../WorkShift.Api/WorkShift.Api.csproj
dotnet add package Moq --version 4.20.72
cd ../WorkShift.Api
dotnet add package Supabase --version 1.1.1
dotnet add package Anthropic.SDK --version 3.8.0
```

- [ ] **Step 2: Write Program.cs**

Replace `backend/WorkShift.Api/Program.cs`:
```csharp
using WorkShift.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p =>
        p.WithOrigins("http://localhost:5173")
         .AllowAnyHeader()
         .AllowAnyMethod()));

builder.Services.AddSingleton<SchedulerService>();
builder.Services.AddSingleton<ConstraintParserService>();
builder.Services.AddSingleton<SupabaseService>();

var app = builder.Build();
app.UseCors();
app.MapControllers();
app.Run();
```

- [ ] **Step 3: Write appsettings.Development.json**

Create `backend/WorkShift.Api/appsettings.Development.json`:
```json
{
  "Supabase": {
    "Url": "https://your-project.supabase.co",
    "ServiceRoleKey": "your-service-role-key"
  },
  "Anthropic": {
    "ApiKey": "your-anthropic-api-key"
  },
  "Urls": "http://localhost:5000"
}
```

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet build
```
Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: scaffold .NET 8 backend with Supabase + Anthropic packages"
```

---

## Task 4: Backend Models

**Files:**
- Create: `backend/WorkShift.Api/Models/Employee.cs`
- Create: `backend/WorkShift.Api/Models/ParsedConstraint.cs`
- Create: `backend/WorkShift.Api/Models/ShiftRequirement.cs`
- Create: `backend/WorkShift.Api/Models/ScheduleShift.cs`

- [ ] **Step 1: Create model files**

Create `backend/WorkShift.Api/Models/Employee.cs`:
```csharp
namespace WorkShift.Api.Models;

public record Employee
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string JobRole { get; init; } = "";   // "waiter" | "cook"
    public bool IsActive { get; init; } = true;
}
```

Create `backend/WorkShift.Api/Models/ParsedConstraint.cs`:
```csharp
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
```

Create `backend/WorkShift.Api/Models/ShiftRequirement.cs`:
```csharp
namespace WorkShift.Api.Models;

public record ShiftRequirement
{
    public int DayOfWeek { get; init; }          // 0=Sun … 5=Fri
    public string ShiftType { get; init; } = ""; // "morning" | "evening"
    public int RequiredWaiters { get; init; }
    public int RequiredCooks { get; init; }
    public DateOnly? TargetDate { get; init; }   // null = default for day_of_week
}
```

Create `backend/WorkShift.Api/Models/ScheduleShift.cs`:
```csharp
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
```

- [ ] **Step 2: Verify build**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend" && dotnet build
```
Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 3: Commit**

```bash
cd ..
git add backend/WorkShift.Api/Models/
git commit -m "feat: add domain models"
```

---

## Task 5: Scheduling Algorithm (TDD)

**Files:**
- Create: `backend/WorkShift.Api/Services/SchedulerService.cs`
- Create: `backend/WorkShift.Api.Tests/SchedulerServiceTests.cs`

- [ ] **Step 1: Write failing tests**

Create `backend/WorkShift.Api.Tests/SchedulerServiceTests.cs`:
```csharp
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
        // 1 waiter needed every slot across 6 days × 2 shifts = 12 demand; should cap at 5
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
    public void Generate_PreferTargetDateRequirement_OverDayOfWeek()
    {
        // Default: Sunday morning = 1 waiter. Override for specific Sunday: 2 waiters.
        var specificSunday = WeekStart; // day 0 = WeekStart date
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet test WorkShift.Api.Tests --filter "SchedulerServiceTests" -v q
```
Expected: compile error — `SchedulerService` not found.

- [ ] **Step 3: Implement SchedulerService**

Create `backend/WorkShift.Api/Services/SchedulerService.cs`:
```csharp
using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

public class SchedulerService
{
    private static readonly string[] DayNames =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

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

            foreach (var shiftType in new[] { "morning", "evening" })
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
            .Where(e => shiftCounts[e.Id] < 5)
            // No same-day double shift (8h rest rule)
            .Where(e => !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day && !s.IsConflict))
            // No evening→morning next-day (8h rest rule): if shiftType==morning, block employee who worked evening day-1
            .Where(e => shiftType != "morning" ||
                        !result.Any(s => s.EmployeeId == e.Id && s.DayOfWeek == day - 1 && s.ShiftType == "evening" && !s.IsConflict))
            // Rotation fairness: prefer fewer shifts assigned
            .OrderBy(e => constraints.TryGetValue(e.Id, out var c) && c.PreferNot.Contains(slotKey) ? 1 : 0)
            .ThenBy(e => shiftCounts[e.Id])
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
        for (int i = assigned; i < required; i++)
        {
            result.Add(new ScheduleShift
            {
                EmployeeId = null,
                DayOfWeek = day,
                ShiftType = shiftType,
                IsConflict = true,
                ConflictReason = $"חסר כוח אדם: נדרש {required} {jobRole}, זמין {assigned}"
            });
        }
    }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet test WorkShift.Api.Tests --filter "SchedulerServiceTests" -v q
```
Expected: `Passed: 6, Failed: 0`

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: scheduling algorithm with rotation, conflict detection, 8h rest rule"
```

---

## Task 6: Constraint Parser Service (TDD)

**Files:**
- Create: `backend/WorkShift.Api/Services/ConstraintParserService.cs`
- Create: `backend/WorkShift.Api.Tests/ConstraintParserServiceTests.cs`

- [ ] **Step 1: Write failing tests**

Create `backend/WorkShift.Api.Tests/ConstraintParserServiceTests.cs`:
```csharp
using System.Net;
using System.Text;
using System.Text.Json;
using Moq;
using WorkShift.Api.Models;
using WorkShift.Api.Services;
using Xunit;

namespace WorkShift.Api.Tests;

public class ConstraintParserServiceTests
{
    private static ConstraintParserService BuildService(string claudeResponseJson)
    {
        var mockHandler = new Mock<HttpMessageHandler>();
        mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(claudeResponseJson, Encoding.UTF8, "application/json")
            });

        var httpClient = new HttpClient(mockHandler.Object);
        return new ConstraintParserService(httpClient, "fake-api-key");
    }

    [Fact]
    public async Task Parse_ReturnsParsedConstraint_OnValidClaudeResponse()
    {
        var claudePayload = JsonSerializer.Serialize(new
        {
            content = new[]
            {
                new { type = "text", text = JsonSerializer.Serialize(new
                {
                    cannot_work = new[] { "tuesday_morning" },
                    prefer_not = new[] { "wednesday_morning" },
                    prefer = Array.Empty<string>(),
                    notes = ""
                })}
            }
        });

        var svc = BuildService(claudePayload);
        var result = await svc.ParseAsync("אני לא יכול ביום שלישי בבוקר");

        Assert.Contains("tuesday_morning", result.CannotWork);
        Assert.Contains("wednesday_morning", result.PreferNot);
    }

    [Fact]
    public async Task Parse_ReturnsEmptyConstraint_WhenClaudeResponseUnparseable()
    {
        var claudePayload = JsonSerializer.Serialize(new
        {
            content = new[] { new { type = "text", text = "לא הצלחתי להבין" } }
        });

        var svc = BuildService(claudePayload);
        var result = await svc.ParseAsync("בלה בלה בלה");

        Assert.Empty(result.CannotWork);
        Assert.Empty(result.PreferNot);
    }
}
```

- [ ] **Step 2: Run tests — verify they fail (compile error)**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet test WorkShift.Api.Tests --filter "ConstraintParserServiceTests" -v q
```
Expected: compile error — `ConstraintParserService` not found.

- [ ] **Step 3: Implement ConstraintParserService**

Create `backend/WorkShift.Api/Services/ConstraintParserService.cs`:
```csharp
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

public class ConstraintParserService
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    private const string SystemPrompt = """
        You are a scheduling assistant. The user will describe their work availability in Hebrew or English.
        Extract their constraints and return ONLY valid JSON in this exact shape:
        {
          "cannot_work": ["day_shift", ...],
          "prefer_not": ["day_shift", ...],
          "prefer": ["day_shift", ...],
          "notes": ""
        }
        Slot format: lowercase English day name + underscore + shift type.
        Day names: sunday, monday, tuesday, wednesday, thursday, friday.
        Shift types: morning, evening.
        Examples: "sunday_morning", "wednesday_evening".
        Return ONLY the JSON object. No explanation, no markdown.
        """;

    public ConstraintParserService(HttpClient httpClient, string apiKey)
    {
        _http = httpClient;
        _apiKey = apiKey;
    }

    // Convenience constructor for DI (reads from config)
    public ConstraintParserService(IConfiguration config)
        : this(new HttpClient(), config["Anthropic:ApiKey"] ?? "")
    { }

    public async Task<ParsedConstraint> ParseAsync(string text)
    {
        var requestBody = JsonSerializer.Serialize(new
        {
            model = "claude-sonnet-4-6",
            max_tokens = 512,
            system = SystemPrompt,
            messages = new[] { new { role = "user", content = text } }
        });

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-api-key", _apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        try
        {
            var response = await _http.SendAsync(request);
            var json = await response.Content.ReadAsStringAsync();

            using var doc = JsonDocument.Parse(json);
            var rawText = doc.RootElement
                .GetProperty("content")[0]
                .GetProperty("text")
                .GetString() ?? "";

            return JsonSerializer.Deserialize<ParsedConstraint>(rawText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new ParsedConstraint();
        }
        catch
        {
            return new ParsedConstraint(); // Graceful fallback — editor will show empty grid
        }
    }
}
```

- [ ] **Step 4: Add Moq.Protected NuGet reference (needed for test HTTP mocking)**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend/WorkShift.Api.Tests"
dotnet add package Moq --version 4.20.72
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet test WorkShift.Api.Tests --filter "ConstraintParserServiceTests" -v q
```
Expected: `Passed: 2, Failed: 0`

- [ ] **Step 6: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: constraint parser service with Claude API integration"
```

---

## Task 7: SupabaseService + Controllers

**Files:**
- Create: `backend/WorkShift.Api/Services/SupabaseService.cs`
- Create: `backend/WorkShift.Api/Controllers/ConstraintsController.cs`
- Create: `backend/WorkShift.Api/Controllers/ScheduleController.cs`

- [ ] **Step 1: Write SupabaseService**

Create `backend/WorkShift.Api/Services/SupabaseService.cs`:
```csharp
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using WorkShift.Api.Models;

namespace WorkShift.Api.Services;

/// <summary>
/// Wraps Supabase REST API using service role key (bypasses RLS — backend use only).
/// </summary>
public class SupabaseService
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;

    public SupabaseService(IConfiguration config)
    {
        _baseUrl = config["Supabase:Url"]!.TrimEnd('/');
        var key = config["Supabase:ServiceRoleKey"]!;
        _http = new HttpClient();
        _http.DefaultRequestHeaders.Add("apikey", key);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        _http.DefaultRequestHeaders.Add("Prefer", "return=representation");
    }

    public async Task<List<Employee>> GetActiveEmployeesAsync()
    {
        var url = $"{_baseUrl}/rest/v1/profiles?role=neq.manager&is_active=eq.true&select=id,name,job_role,is_active";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? [];
        return rows.Select(r => new Employee
        {
            Id = r.GetProperty("id").GetString()!,
            Name = r.GetProperty("name").GetString()!,
            JobRole = r.GetProperty("job_role").GetString() ?? "",
            IsActive = r.GetProperty("is_active").GetBoolean()
        }).ToList();
    }

    public async Task<List<ShiftRequirement>> GetShiftRequirementsAsync()
    {
        var url = $"{_baseUrl}/rest/v1/shift_requirements?select=*";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? [];
        return rows.Select(r => new ShiftRequirement
        {
            DayOfWeek = r.GetProperty("day_of_week").GetInt32(),
            ShiftType = r.GetProperty("shift_type").GetString()!,
            RequiredWaiters = r.GetProperty("required_waiters").GetInt32(),
            RequiredCooks = r.GetProperty("required_cooks").GetInt32(),
            TargetDate = r.TryGetProperty("target_date", out var td) && td.ValueKind != JsonValueKind.Null
                ? DateOnly.Parse(td.GetString()!)
                : null
        }).ToList();
    }

    public async Task<Dictionary<string, ParsedConstraint>> GetApprovedConstraintsAsync(DateOnly weekStart)
    {
        var url = $"{_baseUrl}/rest/v1/constraints?week_start=eq.{weekStart:yyyy-MM-dd}&status=eq.approved&select=employee_id,parsed_json";
        var json = await _http.GetStringAsync(url);
        var rows = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? [];
        var result = new Dictionary<string, ParsedConstraint>();
        foreach (var r in rows)
        {
            var empId = r.GetProperty("employee_id").GetString()!;
            var parsedJson = r.GetProperty("parsed_json").GetRawText();
            var constraint = JsonSerializer.Deserialize<ParsedConstraint>(parsedJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (constraint != null) result[empId] = constraint;
        }
        return result;
    }

    public async Task<string> UpsertScheduleAsync(DateOnly weekStart)
    {
        var url = $"{_baseUrl}/rest/v1/schedules";
        var body = JsonSerializer.Serialize(new { week_start = weekStart.ToString("yyyy-MM-dd"), status = "draft" });
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("Prefer", "resolution=merge-duplicates,return=representation");
        var response = await _http.SendAsync(req);
        var json = await response.Content.ReadAsStringAsync();
        var arr = JsonSerializer.Deserialize<List<JsonElement>>(json)!;
        return arr[0].GetProperty("id").GetString()!;
    }

    public async Task SaveShiftsAsync(string scheduleId, List<ScheduleShift> shifts)
    {
        // Delete existing draft shifts for this schedule
        await _http.DeleteAsync($"{_baseUrl}/rest/v1/schedule_shifts?schedule_id=eq.{scheduleId}");

        var rows = shifts.Select(s => new
        {
            schedule_id = scheduleId,
            employee_id = s.EmployeeId,
            day_of_week = s.DayOfWeek,
            shift_type = s.ShiftType,
            is_conflict = s.IsConflict,
            conflict_reason = s.ConflictReason
        });

        var body = JsonSerializer.Serialize(rows);
        var content = new StringContent(body, Encoding.UTF8, "application/json");
        await _http.PostAsync($"{_baseUrl}/rest/v1/schedule_shifts", content);
    }

    public async Task UpdateShiftAsync(string shiftId, string employeeId)
    {
        var url = $"{_baseUrl}/rest/v1/schedule_shifts?id=eq.{shiftId}";
        var body = JsonSerializer.Serialize(new { employee_id = employeeId, is_conflict = false, conflict_reason = (string?)null });
        var req = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        await _http.SendAsync(req);
    }

    public async Task PublishScheduleAsync(string scheduleId)
    {
        var url = $"{_baseUrl}/rest/v1/schedules?id=eq.{scheduleId}";
        var body = JsonSerializer.Serialize(new { status = "published" });
        var req = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        await _http.SendAsync(req);
    }
}
```

- [ ] **Step 2: Write ConstraintsController**

Create `backend/WorkShift.Api/Controllers/ConstraintsController.cs`:
```csharp
using Microsoft.AspNetCore.Mvc;
using WorkShift.Api.Services;

namespace WorkShift.Api.Controllers;

[ApiController]
[Route("api/constraints")]
public class ConstraintsController : ControllerBase
{
    private readonly ConstraintParserService _parser;

    public ConstraintsController(ConstraintParserService parser) => _parser = parser;

    [HttpPost("parse")]
    public async Task<IActionResult> Parse([FromBody] ParseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest("text is required");

        var result = await _parser.ParseAsync(req.Text);
        return Ok(result);
    }

    public record ParseRequest(string Text);
}
```

- [ ] **Step 3: Write ScheduleController**

Create `backend/WorkShift.Api/Controllers/ScheduleController.cs`:
```csharp
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
        var weekStart = DateOnly.Parse(req.WeekStart);
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
        await _db.UpdateShiftAsync(id, req.EmployeeId);
        return Ok();
    }

    [HttpPost("{scheduleId}/publish")]
    public async Task<IActionResult> Publish(string scheduleId)
    {
        await _db.PublishScheduleAsync(scheduleId);
        return Ok();
    }

    public record GenerateRequest(string WeekStart);
    public record UpdateShiftRequest(string EmployeeId);
}
```

- [ ] **Step 4: Build and smoke-test**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet build && dotnet run --project WorkShift.Api
```
In a second terminal:
```bash
curl -X POST http://localhost:5000/api/constraints/parse \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"אני לא יכול ביום שני\"}"
```
Expected: JSON with `cannot_work`, `prefer_not`, etc.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: controllers + Supabase service — full backend complete"
```

---

## Task 8: Frontend Project Setup

**Files:**
- Create: `frontend/package.json` (via Vite scaffold)
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`

- [ ] **Step 1: Scaffold Vite + React + TypeScript**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material
npm install @supabase/supabase-js
npm install @hello-pangea/dnd
npm install date-fns
npm install react-router-dom
```

- [ ] **Step 2: Copy env file**

```bash
cp .env.example .env
```
Then edit `frontend/.env` with real Supabase URL and anon key.

- [ ] **Step 3: Verify dev server starts**

```bash
npm run dev
```
Expected: `Local: http://localhost:5173/` — browser shows Vite default page.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold React + Vite + MUI + Supabase + DnD frontend"
```

---

## Task 9: Supabase Client + Types

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Write shared types**

Create `frontend/src/types/index.ts`:
```typescript
export type UserRole = 'employee' | 'manager';
export type JobRole = 'waiter' | 'cook';
export type ShiftType = 'morning' | 'evening';
export type ConstraintStatus = 'pending' | 'approved' | 'rejected';
export type ScheduleStatus = 'draft' | 'published';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  job_role: JobRole | null;
  is_active: boolean;
  created_at: string;
}

export interface ShiftRequirement {
  id: string;
  day_of_week: number;   // 0=Sun … 5=Fri
  shift_type: ShiftType;
  required_waiters: number;
  required_cooks: number;
  target_date: string | null;
}

export interface ParsedConstraint {
  cannot_work: string[];
  prefer_not: string[];
  prefer: string[];
  notes: string;
}

export interface Constraint {
  id: string;
  employee_id: string;
  week_start: string;
  raw_text: string;
  parsed_json: ParsedConstraint | null;
  status: ConstraintStatus;
  created_at: string;
}

export interface Schedule {
  id: string;
  week_start: string;
  status: ScheduleStatus;
}

export interface ScheduleShift {
  id: string;
  schedule_id: string;
  employee_id: string | null;  // null = unfilled slot
  day_of_week: number;
  shift_type: ShiftType;
  is_conflict: boolean;
  conflict_reason: string | null;
  // joined
  profile?: Profile;
}

// Slot key format used in parsed_json arrays
export type SlotKey =
  `${'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'}_${'morning'|'evening'}`;

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export const SHIFT_LABELS: Record<ShiftType, string> = { morning: 'בוקר', evening: 'ערב' };
```

- [ ] **Step 2: Write Supabase client**

Create `frontend/src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/lib/ frontend/src/types/
git commit -m "feat: Supabase client + shared TypeScript types"
```

---

## Task 10: App Shell + Login Page + Auth Guard

**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Write main.tsx**

Replace `frontend/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

const theme = createTheme({
  direction: 'rtl',
  palette: { primary: { main: '#1976d2' } },
  typography: { fontFamily: 'Rubik, Arial, sans-serif' },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

Also add Rubik font to `frontend/index.html` inside `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Write App.tsx**

Create `frontend/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Profile } from './types';
import LoginPage from './pages/LoginPage';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import { CircularProgress, Box } from '@mui/material';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
    setLoading(false);
  }

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <CircularProgress />
    </Box>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!profile ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/" element={
          !profile ? <Navigate to="/login" /> :
          profile.role === 'manager' ? <ManagerDashboard profile={profile} /> :
          <EmployeeDashboard profile={profile} />
        } />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Write LoginPage**

Create `frontend/src/pages/LoginPage.tsx`:
```tsx
import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Select, MenuItem, FormControl, InputLabel, Alert
} from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

export default function LoginPage() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id,name,role').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  async function handleLogin() {
    setError('');
    setLoading(true);
    const selected = employees.find(e => e.name === selectedName);
    if (!selected) { setError('יש לבחור שם'); setLoading(false); return; }

    const email = `${selected.name.replace(/\s+/g, '.')}@workshift.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) setError('סיסמה שגויה');
    setLoading(false);
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#f5f5f5">
      <Card sx={{ width: 360, p: 2 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={700} textAlign="center" mb={3}>
            WorkShift
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>בחר שם</InputLabel>
            <Select value={selectedName} onChange={e => setSelectedName(e.target.value)} label="בחר שם">
              {employees.map(e => (
                <MenuItem key={e.id} value={e.name}>{e.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth label="סיסמה" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            sx={{ mb: 2 }}
          />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Button fullWidth variant="contained" onClick={handleLogin} disabled={loading}>
            כניסה
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 4: Verify login page renders**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/frontend"
npm run dev
```
Open `http://localhost:5173/login` — should show name dropdown + password field.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: app shell, auth guard, login page"
```

---

## Task 11: Employee Dashboard — Schedule View

**Files:**
- Create: `frontend/src/components/schedule/WeeklyGrid.tsx`
- Create: `frontend/src/pages/EmployeeDashboard.tsx`

- [ ] **Step 1: Write WeeklyGrid component**

Create `frontend/src/components/schedule/WeeklyGrid.tsx`:
```tsx
import { Box, Paper, Typography, Chip } from '@mui/material';
import { ScheduleShift, Profile, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

interface Props {
  shifts: ScheduleShift[];
  employees: Profile[];
  currentEmployeeId?: string; // highlight this employee's shifts
}

const SHIFT_TYPES: ShiftType[] = ['morning', 'evening'];

export default function WeeklyGrid({ shifts, employees, currentEmployeeId }: Props) {
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  function getShifts(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box display="grid" gridTemplateColumns={`120px repeat(6, 1fr)`} gap={0.5} minWidth={700}>
        {/* Header */}
        <Box />
        {DAY_NAMES.map(d => (
          <Paper key={d} sx={{ p: 1, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
            <Typography variant="body2" fontWeight={700}>{d}</Typography>
          </Paper>
        ))}

        {SHIFT_TYPES.map(type => (
          <>
            <Paper key={type} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" fontWeight={500}>{SHIFT_LABELS[type]}</Typography>
            </Paper>
            {Array.from({ length: 6 }, (_, day) => (
              <Paper key={day} variant="outlined" sx={{ p: 1, minHeight: 64 }}>
                {getShifts(day, type).map(s => {
                  const emp = s.employee_id ? empMap[s.employee_id] : null;
                  const isMe = s.employee_id === currentEmployeeId;
                  return (
                    <Chip
                      key={s.id}
                      label={emp?.name ?? '—'}
                      size="small"
                      color={isMe ? 'primary' : 'default'}
                      sx={{ m: 0.25, opacity: s.employee_id ? 1 : 0.4 }}
                    />
                  );
                })}
              </Paper>
            ))}
          </>
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Write EmployeeDashboard**

Create `frontend/src/pages/EmployeeDashboard.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile, ScheduleShift, Schedule } from '../types';
import WeeklyGrid from '../components/schedule/WeeklyGrid';
import ConstraintEditor from '../components/constraints/ConstraintEditor';

interface Props { profile: Profile; }

export default function EmployeeDashboard({ profile }: Props) {
  const [tab, setTab] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);

  useEffect(() => {
    // Load published schedule for current week
    const weekStart = getWeekStart();
    supabase.from('schedules').select('*')
      .eq('week_start', weekStart).eq('status', 'published').single()
      .then(({ data }) => {
        setSchedule(data ?? null);
        if (data) {
          supabase.from('schedule_shifts').select('*, profile:profiles(*)').eq('schedule_id', data.id)
            .then(({ data: s }) => setShifts(s ?? []));
        }
      });

    supabase.from('profiles').select('*').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>WorkShift — שלום {profile.name}</Typography>
          <Button color="inherit" onClick={handleSignOut}>יציאה</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="המשמרות שלי" />
          <Tab label="הגשת אילוצים" />
        </Tabs>
      </Box>

      <Box p={3}>
        {tab === 0 && (
          schedule
            ? <WeeklyGrid shifts={shifts} employees={employees} currentEmployeeId={profile.id} />
            : <Typography color="text.secondary" textAlign="center">לוח המשמרות טרם פורסם</Typography>
        )}
        {tab === 1 && <ConstraintEditor profile={profile} />}
      </Box>
    </Box>
  );
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().split('T')[0];
}
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/
git commit -m "feat: employee dashboard + weekly schedule grid"
```

---

## Task 12: Employee — Constraint Editor

**Files:**
- Create: `frontend/src/components/constraints/ConstraintEditor.tsx`

- [ ] **Step 1: Write ConstraintEditor**

Create `frontend/src/components/constraints/ConstraintEditor.tsx`:
```tsx
import { useState } from 'react';
import {
  Box, TextField, Button, Typography, Paper, Chip, CircularProgress, Alert
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { Profile, ParsedConstraint, DAY_KEYS, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

type SlotState = 'available' | 'prefer_not' | 'cannot_work';

const SLOT_COLORS: Record<SlotState, 'success' | 'warning' | 'error'> = {
  available: 'success',
  prefer_not: 'warning',
  cannot_work: 'error',
};
const SLOT_LABELS: Record<SlotState, string> = {
  available: 'פנוי',
  prefer_not: 'עדיף לא',
  cannot_work: 'לא יכול',
};
const CYCLE: SlotState[] = ['available', 'prefer_not', 'cannot_work'];

function parsedToGrid(parsed: ParsedConstraint): Record<string, SlotState> {
  const grid: Record<string, SlotState> = {};
  for (const key of parsed.cannot_work) grid[key] = 'cannot_work';
  for (const key of parsed.prefer_not) grid[key] = 'prefer_not';
  return grid;
}

function gridToParsed(grid: Record<string, SlotState>): ParsedConstraint {
  const cannot_work: string[] = [];
  const prefer_not: string[] = [];
  for (const [key, state] of Object.entries(grid)) {
    if (state === 'cannot_work') cannot_work.push(key);
    if (state === 'prefer_not') prefer_not.push(key);
  }
  return { cannot_work, prefer_not, prefer: [], notes: '' };
}

function getWeekStart(): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  return sunday.toISOString().split('T')[0];
}

interface Props { profile: Profile; }

export default function ConstraintEditor({ profile }: Props) {
  const [text, setText] = useState('');
  const [grid, setGrid] = useState<Record<string, SlotState> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState('');
  const [success, setSuccess] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL as string;

  async function handleParse() {
    setParsing(true);
    setParseError('');
    setSuccess(false);
    try {
      const res = await fetch(`${apiUrl}/api/constraints/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const parsed: ParsedConstraint = await res.json();
      setGrid(parsedToGrid(parsed));
    } catch {
      setParseError('לא הצלחנו לפרש, אנא נסח מחדש');
    }
    setParsing(false);
  }

  function cycleSlot(key: string) {
    setGrid(prev => {
      const current: SlotState = prev?.[key] ?? 'available';
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
      const updated = { ...prev };
      if (next === 'available') delete updated[key];
      else updated[key] = next;
      return updated;
    });
  }

  async function handleSubmit() {
    if (!grid) return;
    setSaving(true);
    const parsed = gridToParsed(grid);
    await supabase.from('constraints').upsert({
      employee_id: profile.id,
      week_start: getWeekStart(),
      raw_text: text,
      parsed_json: parsed,
      status: 'pending',
    }, { onConflict: 'employee_id,week_start' });
    setSaving(false);
    setSuccess(true);
  }

  const shifts: ShiftType[] = ['morning', 'evening'];

  return (
    <Box maxWidth={700} mx="auto">
      <Typography variant="h6" mb={2}>הגשת אילוצים לשבוע הבא</Typography>

      <TextField
        fullWidth multiline rows={3}
        label="תאר את האילוצים שלך בחופשיות"
        placeholder="למשל: אני לא יכול ביום ראשון בבוקר, ועדיף שלא ביום שני"
        value={text} onChange={e => setText(e.target.value)}
        sx={{ mb: 2, direction: 'rtl' }}
      />

      <Button variant="contained" onClick={handleParse} disabled={parsing || !text.trim()} sx={{ mb: 2 }}>
        {parsing ? <CircularProgress size={20} color="inherit" /> : 'פרש עם AI'}
      </Button>

      {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}

      {grid !== null && (
        <>
          <Typography variant="body2" color="text.secondary" mb={1}>
            לחץ על כל תא כדי לשנות את הסטטוס: פנוי → עדיף לא → לא יכול
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box display="grid" gridTemplateColumns="80px repeat(6, 1fr)" gap={1}>
              <Box />
              {DAY_NAMES.map(d => (
                <Typography key={d} variant="caption" textAlign="center" fontWeight={700}>{d}</Typography>
              ))}

              {shifts.map(type => (
                <>
                  <Typography key={type} variant="caption" display="flex" alignItems="center" fontWeight={500}>
                    {SHIFT_LABELS[type]}
                  </Typography>
                  {DAY_KEYS.map((dayKey, idx) => {
                    const slotKey = `${dayKey}_${type}`;
                    const state: SlotState = grid[slotKey] ?? 'available';
                    return (
                      <Chip
                        key={idx}
                        label={SLOT_LABELS[state]}
                        color={SLOT_COLORS[state]}
                        size="small"
                        onClick={() => cycleSlot(slotKey)}
                        sx={{ cursor: 'pointer', fontSize: 11 }}
                      />
                    );
                  })}
                </>
              ))}
            </Box>
          </Paper>

          <Button variant="contained" color="success" onClick={handleSubmit} disabled={saving}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'שמור אילוצים'}
          </Button>

          {success && <Alert severity="success" sx={{ mt: 2 }}>האילוצים נשמרו בהצלחה</Alert>}
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/components/constraints/
git commit -m "feat: constraint chip grid editor with AI parse + manual correction"
```

---

## Task 13: Manager Dashboard + Employee CRUD

**Files:**
- Create: `frontend/src/pages/ManagerDashboard.tsx`
- Create: `frontend/src/components/manager/EmployeeTable.tsx`

- [ ] **Step 1: Write EmployeeTable**

Create `frontend/src/components/manager/EmployeeTable.tsx`:
```tsx
import { useState, useEffect } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, IconButton, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { supabase } from '../../lib/supabase';
import { Profile, JobRole } from '../../types';

const JOB_ROLE_LABELS: Record<JobRole, string> = { waiter: 'מלצר', cook: 'טבח' };

export default function EmployeeTable() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Profile>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').neq('role', 'manager').order('name');
    setEmployees(data ?? []);
  }

  function openNew() { setEditing({ role: 'employee', is_active: true }); setOpen(true); }
  function openEdit(e: Profile) { setEditing(e); setOpen(true); }

  async function save() {
    if (editing.id) {
      await supabase.from('profiles').update({
        name: editing.name, job_role: editing.job_role, is_active: editing.is_active
      }).eq('id', editing.id);
    } else {
      // Create Supabase Auth user + profile
      const email = `${(editing.name ?? '').replace(/\s+/g, '.')}@workshift.local`;
      const { data: authData } = await supabase.auth.admin.createUser({
        email, password: '0000',
        user_metadata: { name: editing.name }
      });
      if (authData.user) {
        await supabase.from('profiles').update({
          name: editing.name, role: 'employee', job_role: editing.job_role
        }).eq('id', authData.user.id);
      }
    }
    setOpen(false);
    load();
  }

  async function deactivate(id: string) {
    await supabase.from('profiles').update({ is_active: false }).eq('id', id);
    load();
  }

  return (
    <Box>
      <Button variant="contained" sx={{ mb: 2 }} onClick={openNew}>+ הוסף עובד</Button>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>שם</TableCell>
              <TableCell>תפקיד</TableCell>
              <TableCell>סטטוס</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map(e => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{e.job_role ? JOB_ROLE_LABELS[e.job_role] : '—'}</TableCell>
                <TableCell>
                  <Chip label={e.is_active ? 'פעיל' : 'לא פעיל'}
                    color={e.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => openEdit(e)}><EditIcon /></IconButton>
                  {e.is_active && (
                    <IconButton size="small" onClick={() => deactivate(e.id)}><PersonOffIcon /></IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editing.id ? 'עריכת עובד' : 'הוספת עובד'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="שם" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
          <FormControl>
            <InputLabel>תפקיד</InputLabel>
            <Select value={editing.job_role ?? ''} label="תפקיד"
              onChange={e => setEditing(p => ({ ...p, job_role: e.target.value as JobRole }))}>
              <MenuItem value="waiter">מלצר</MenuItem>
              <MenuItem value="cook">טבח</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={save}>שמור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 2: Write ManagerDashboard shell**

Create `frontend/src/pages/ManagerDashboard.tsx`:
```tsx
import { useState } from 'react';
import { Box, Tabs, Tab, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import EmployeeTable from '../components/manager/EmployeeTable';
import ShiftRequirementsGrid from '../components/manager/ShiftRequirementsGrid';
import DraggableScheduleGrid from '../components/manager/DraggableScheduleGrid';

interface Props { profile: Profile; }

export default function ManagerDashboard({ profile }: Props) {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>WorkShift — ניהול ({profile.name})</Typography>
          <Button color="inherit" onClick={() => supabase.auth.signOut()}>יציאה</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="עובדים" />
          <Tab label="דרישות משמרת" />
          <Tab label="לוח משמרות" />
        </Tabs>
      </Box>

      <Box p={3}>
        {tab === 0 && <EmployeeTable />}
        {tab === 1 && <ShiftRequirementsGrid />}
        {tab === 2 && <DraggableScheduleGrid />}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/
git commit -m "feat: manager dashboard shell + employee CRUD table"
```

---

## Task 14: Shift Requirements Grid

**Files:**
- Create: `frontend/src/components/manager/ShiftRequirementsGrid.tsx`

- [ ] **Step 1: Write ShiftRequirementsGrid**

Create `frontend/src/components/manager/ShiftRequirementsGrid.tsx`:
```tsx
import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Alert
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { ShiftRequirement, DAY_NAMES, ShiftType, SHIFT_LABELS } from '../../types';

type GridCell = { waiters: number; cooks: number; reqId: string | null };
type Grid = Record<string, GridCell>; // key = `${day}_${shift_type}`

const SHIFTS: ShiftType[] = ['morning', 'evening'];

export default function ShiftRequirementsGrid() {
  const [grid, setGrid] = useState<Grid>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('shift_requirements').select('*').is('target_date', null)
      .then(({ data }) => {
        const g: Grid = {};
        (data as ShiftRequirement[] ?? []).forEach(r => {
          g[`${r.day_of_week}_${r.shift_type}`] = {
            waiters: r.required_waiters,
            cooks: r.required_cooks,
            reqId: r.id,
          };
        });
        setGrid(g);
      });
  }, []);

  function update(day: number, type: ShiftType, field: 'waiters' | 'cooks', value: string) {
    const key = `${day}_${type}`;
    setGrid(prev => ({ ...prev, [key]: { ...prev[key], [field]: parseInt(value) || 0 } }));
  }

  async function save() {
    setSaving(true);
    for (let day = 0; day <= 5; day++) {
      for (const type of SHIFTS) {
        const key = `${day}_${type}`;
        const cell = grid[key];
        if (!cell) continue;
        await supabase.from('shift_requirements').upsert({
          id: cell.reqId ?? undefined,
          day_of_week: day,
          shift_type: type,
          required_waiters: cell.waiters,
          required_cooks: cell.cooks,
          target_date: null,
        }, { onConflict: 'day_of_week,shift_type,target_date' });
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Box maxWidth={900} mx="auto">
      <Typography variant="h6" mb={2}>דרישות משמרת ברירת מחדל</Typography>
      <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
        <Box display="grid" gridTemplateColumns="100px repeat(6, 1fr)" gap={1} minWidth={700}>
          <Box />
          {DAY_NAMES.map(d => (
            <Typography key={d} variant="caption" fontWeight={700} textAlign="center">{d}</Typography>
          ))}
          {SHIFTS.map(type => (
            <>
              <Typography key={type} variant="caption" display="flex" alignItems="center" fontWeight={500}>
                {SHIFT_LABELS[type]}
              </Typography>
              {Array.from({ length: 6 }, (_, day) => {
                const cell = grid[`${day}_${type}`] ?? { waiters: 2, cooks: 3, reqId: null };
                return (
                  <Box key={day} display="flex" flexDirection="column" gap={0.5}>
                    <TextField size="small" label="מלצרים" type="number" value={cell.waiters}
                      onChange={e => update(day, type, 'waiters', e.target.value)}
                      inputProps={{ min: 0, style: { textAlign: 'center' } }} />
                    <TextField size="small" label="טבחים" type="number" value={cell.cooks}
                      onChange={e => update(day, type, 'cooks', e.target.value)}
                      inputProps={{ min: 0, style: { textAlign: 'center' } }} />
                  </Box>
                );
              })}
            </>
          ))}
        </Box>
      </Paper>

      <Box mt={2} display="flex" gap={2} alignItems="center">
        <Button variant="contained" onClick={save} disabled={saving}>שמור דרישות</Button>
        {saved && <Alert severity="success" sx={{ py: 0 }}>נשמר</Alert>}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/components/manager/ShiftRequirementsGrid.tsx
git commit -m "feat: shift requirements inline-edit grid"
```

---

## Task 15: Manager — Draggable Schedule Grid

**Files:**
- Create: `frontend/src/components/manager/DraggableScheduleGrid.tsx`

- [ ] **Step 1: Write DraggableScheduleGrid**

Create `frontend/src/components/manager/DraggableScheduleGrid.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Box, Paper, Typography, Button, Chip, Tooltip, Alert, CircularProgress, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { Profile, ScheduleShift, Schedule, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';
import { format, startOfWeek, addDays } from 'date-fns';

const apiUrl = import.meta.env.VITE_API_URL as string;
const SHIFTS: ShiftType[] = ['morning', 'evening'];

function getWeekStart(offset = 0): string {
  const d = startOfWeek(addDays(new Date(), offset * 7), { weekStartsOn: 0 });
  return format(d, 'yyyy-MM-dd');
}

export default function DraggableScheduleGrid() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');

  const weekStart = getWeekStart(weekOffset);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_active', true).neq('role', 'manager')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => { loadSchedule(); }, [weekStart]);

  async function loadSchedule() {
    setSchedule(null); setShifts([]);
    const { data } = await supabase.from('schedules').select('*').eq('week_start', weekStart).single();
    if (data) {
      setSchedule(data);
      const { data: s } = await supabase.from('schedule_shifts').select('*').eq('schedule_id', data.id);
      setShifts(s ?? []);
    }
  }

  async function generate() {
    setGenerating(true); setMsg('');
    const res = await fetch(`${apiUrl}/api/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart }),
    });
    const data = await res.json();
    setMsg(`נוצר לוח — ${data.conflict_count} קונפליקטים`);
    await loadSchedule();
    setGenerating(false);
  }

  async function publish() {
    if (!schedule) return;
    setPublishing(true);
    await fetch(`${apiUrl}/api/schedule/${schedule.id}/publish`, { method: 'POST' });
    await loadSchedule();
    setPublishing(false);
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const shiftId = result.draggableId;
    const [day, type, targetEmpId] = result.destination.droppableId.split('__');

    // Find the shift being moved
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    // Update local state optimistically
    setShifts(prev => prev.map(s =>
      s.id === shiftId ? { ...s, employee_id: targetEmpId, is_conflict: false, conflict_reason: null } : s
    ));

    // Persist
    await fetch(`${apiUrl}/api/schedule/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: targetEmpId }),
    });
  }

  function getShiftCell(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  return (
    <Box>
      {/* Week picker */}
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <Button onClick={() => setWeekOffset(w => w - 1)}>◄ שבוע קודם</Button>
        <Typography fontWeight={700}>{weekStart}</Typography>
        <Button onClick={() => setWeekOffset(w => w + 1)}>שבוע הבא ►</Button>
        <Button variant="contained" onClick={generate} disabled={generating}>
          {generating ? <CircularProgress size={18} color="inherit" /> : 'ייצר לוח'}
        </Button>
        {schedule && schedule.status === 'draft' && (
          <Button variant="contained" color="success" onClick={publish} disabled={publishing}>
            {publishing ? <CircularProgress size={18} color="inherit" /> : 'פרסם'}
          </Button>
        )}
        {schedule && <Chip label={schedule.status === 'published' ? 'מפורסם' : 'טיוטה'}
          color={schedule.status === 'published' ? 'success' : 'warning'} />}
      </Box>

      {msg && <Alert severity="info" sx={{ mb: 2 }}>{msg}</Alert>}

      {!schedule && (
        <Typography color="text.secondary">לחץ על "ייצר לוח" כדי להתחיל</Typography>
      )}

      {schedule && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box display="grid" gridTemplateColumns="100px repeat(6, 1fr)" gap={0.5} minWidth={750}>
              {/* Header */}
              <Box />
              {DAY_NAMES.map(d => (
                <Paper key={d} sx={{ p: 1, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
                  <Typography variant="caption" fontWeight={700}>{d}</Typography>
                </Paper>
              ))}

              {SHIFTS.map(type => (
                <>
                  <Paper key={type} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="caption" fontWeight={500}>{SHIFT_LABELS[type]}</Typography>
                  </Paper>

                  {Array.from({ length: 6 }, (_, day) => {
                    const cellShifts = getShiftCell(day, type);
                    const dropId = `${day}__${type}__drop`;
                    return (
                      <Droppable droppableId={dropId} key={day}>
                        {(provided) => (
                          <Paper
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            variant="outlined"
                            sx={{ p: 0.5, minHeight: 70, bgcolor: cellShifts.some(s => s.is_conflict) ? '#fff8e1' : 'white' }}
                          >
                            {cellShifts.map((s, idx) => {
                              const emp = s.employee_id ? empMap[s.employee_id] : null;
                              return (
                                <Draggable key={s.id} draggableId={s.id} index={idx}>
                                  {(drag) => (
                                    <Tooltip title={s.conflict_reason ?? ''} disableHoverListener={!s.is_conflict}>
                                      <Chip
                                        ref={drag.innerRef}
                                        {...drag.draggableProps}
                                        {...drag.dragHandleProps}
                                        label={emp?.name ?? '⚠ חסר'}
                                        size="small"
                                        color={s.is_conflict ? 'warning' : 'default'}
                                        sx={{ m: 0.25, cursor: 'grab', fontSize: 11 }}
                                      />
                                    </Tooltip>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </Paper>
                        )}
                      </Droppable>
                    );
                  })}
                </>
              ))}
            </Box>
          </Box>
        </DragDropContext>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add frontend/src/components/manager/DraggableScheduleGrid.tsx
git commit -m "feat: draggable schedule grid with conflict highlights + generate + publish"
```

---

## Task 16: Wiring, Config & Final Smoke Test

**Files:**
- Modify: `frontend/src/main.tsx` (RTL direction provider)
- Modify: `backend/WorkShift.Api/Program.cs` (register IConfiguration for services)

- [ ] **Step 1: Add RTL cache to MUI**

Add `@mui/material-nextjs` or configure `rtlPlugin` — simplest approach: wrap with `CacheProvider`.

Install:
```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/frontend"
npm install stylis-plugin-rtl @emotion/cache
```

Update `frontend/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

const theme = createTheme({
  direction: 'rtl',
  palette: { primary: { main: '#1976d2' } },
  typography: { fontFamily: 'Rubik, Arial, sans-serif' },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </CacheProvider>
  </React.StrictMode>
);
```

Also add `dir="rtl"` to `<body>` in `frontend/index.html`:
```html
<body dir="rtl">
```

- [ ] **Step 2: Fill real Supabase + Anthropic credentials**

Edit `backend/WorkShift.Api/appsettings.Development.json` with real values:
- `Supabase:Url` → your Supabase project URL
- `Supabase:ServiceRoleKey` → from Supabase → Settings → API → service_role key
- `Anthropic:ApiKey` → from console.anthropic.com

Edit `frontend/.env`:
- `VITE_SUPABASE_URL` → same URL
- `VITE_SUPABASE_ANON_KEY` → anon/public key (NOT service role)
- `VITE_API_URL` → `http://localhost:5000`

- [ ] **Step 3: Create manager user in Supabase**

In Supabase dashboard → Authentication → Users → Add user:
- Email: `manager@workshift.local`
- Password: `0000`

Then in SQL Editor:
```sql
UPDATE public.profiles
SET role = 'manager', name = 'מנהל', job_role = null
WHERE id = (SELECT id FROM auth.users WHERE email = 'manager@workshift.local');
```

- [ ] **Step 4: Run full stack smoke test**

Terminal 1 — Backend:
```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet run --project WorkShift.Api
```

Terminal 2 — Frontend:
```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/frontend"
npm run dev
```

Smoke test checklist:
- [ ] Login as manager → sees Manager Dashboard with 3 tabs
- [ ] Employees tab → add an employee (waiter), add another (cook)
- [ ] Shift Requirements tab → verify defaults load, save change
- [ ] Schedule tab → click "ייצר לוח" → grid appears, conflict cells amber
- [ ] Drag a chip to a different cell → chip moves
- [ ] Click "פרסם" → status changes to "מפורסם"
- [ ] Login as employee → My Schedule tab shows published grid
- [ ] Constraints tab → type free text → click "פרש עם AI" → chip grid appears → click chips to change → Save

- [ ] **Step 5: Run all backend tests**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift/backend"
dotnet test -v q
```
Expected: All tests pass.

- [ ] **Step 6: Final commit**

```bash
cd "c:/Users/tomer/OneDrive/שולחן העבודה/WorkShift"
git add .
git commit -m "feat: complete WorkShift MVP — full stack scheduling app"
```

---

## Self-Review Checklist

| Spec requirement | Covered in task |
|-----------------|----------------|
| Supabase Auth email/password + default 0000 | Tasks 10, 16 |
| profiles, constraints, schedules, schedule_shifts tables | Task 2 |
| shift_requirements with target_date override | Tasks 2, 5 |
| RLS — employee sees own + published | Task 2 |
| POST /api/constraints/parse → Claude AI | Tasks 6, 7 |
| POST /api/schedule/generate | Tasks 5, 7 |
| PATCH /api/schedule/shifts/:id | Task 7 |
| 8h rest rule (no same-day double + no eve→morn next day) | Task 5 |
| Max 5 shifts/week | Task 5 |
| Role-based assignments (waiter/cook) | Task 5 |
| Rotation fairness | Task 5 |
| Employee: weekly grid read-only | Task 11 |
| Employee: free-text → AI parse → chip grid edit → submit | Task 12 |
| Manager: employee CRUD | Task 13 |
| Manager: shift requirements inline edit | Task 14 |
| Manager: D&D schedule grid + conflict highlights | Task 15 |
| Manager: Generate + Publish buttons | Task 15 |
| RTL Hebrew UI | Task 16 |
