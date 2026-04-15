# Design: Weekly Overrides & Monthly Hours Tracking
Date: 2026-04-15

## Overview
Two features:
1. Manager can set one-time weekly adjustments before generating a schedule (close shifts, change staffing counts)
2. Monthly hours tracking — visible to employees in their personal area and to managers in the employee table

---

## DB Changes

```sql
-- Editable hours per shift assignment (default 8)
ALTER TABLE schedule_shifts ADD COLUMN IF NOT EXISTS hours numeric DEFAULT 8;

-- shift_requirements.target_date already exists — no change needed
```

---

## Feature 1: Weekly Overrides

### User Story
Before generating a schedule for a new week, the manager sees a weekly setup panel. They can close shifts (e.g., holiday) or adjust waiter/cook counts (e.g., special event). When "Generate" is clicked, the scheduler uses these overrides automatically via the existing `target_date` mechanism.

### UI: WeeklyOverridePanel component
- Shown in `DraggableScheduleGrid` when no schedule exists for the selected week
- Displayed above the "Generate" button
- Grid: rows = morning / evening, columns = Sun–Fri (6 days)
- Each cell shows: default counts (from `shift_requirements` where `target_date IS NULL`) + any existing override
- Clicking a cell opens an inline editor: waiter count, cook count, "close shift" toggle (sets both to 0)
- "Save overrides" button → upserts rows into `shift_requirements` with the specific `target_date` for each day
- If no changes made, no rows are written (defaults apply)

### Data Flow
1. Load default requirements (target_date IS NULL) from Supabase
2. Load existing target_date overrides for current week
3. Manager edits → local state only
4. "Save" → upsert to `shift_requirements` with target_date per day
5. Scheduler already prefers target_date over defaults — no backend change needed

### Supabase Access
Direct from frontend using Supabase client (manager role has `req_manager_write` RLS policy).

---

## Feature 2: Monthly Hours Tracking

### Shift Duration Constants (frontend)
```ts
const SHIFT_HOURS = { morning: 8, evening: 8 }
```
Manager can override `hours` per shift assignment in ShiftSlotPanel (e.g., if employee starts at 12:00 instead of 10:00 → set to 6h).

### ShiftSlotPanel change
- Add a numeric `שעות` field next to each employee in the slot
- Defaults to 8, saves to `schedule_shifts.hours`
- Sent in existing `PATCH /api/schedule/shifts/{id}` (add `hours` to request body)

### Employee Personal Area
New tab "אזור אישי" in `EmployeeDashboard`:
- Query: published schedules for current calendar month → their shift_ids → filter by employee_id
- Display:
  - **סך משמרות החודש** — total count
  - **סך שעות החודש** — SUM(hours)
  - **פירוט**: בוקר X משמרות | ערב Y משמרות
  - **השוואה לחודש קודם** — same query for previous month, shown as +/- delta

### Manager Employee Table
In `EmployeeTable`, add to each row:
- "שעות החודש: X" shown as a small chip or text under the employee's name/status
- Data fetched once on component load: all published schedule_shifts for current month, grouped by employee_id, SUM(hours)
- Single Supabase query with join: `schedule_shifts` → `schedules` (filter published + current month)

---

## Implementation Order
1. Run DB migration (user runs SQL)
2. Backend: add `hours` to `UpdateShiftRequest` + `PatchShiftDetailsAsync`
3. Frontend: `ShiftSlotPanel` — add hours field
4. Frontend: `WeeklyOverridePanel` — new component
5. Frontend: `DraggableScheduleGrid` — integrate panel
6. Frontend: `PersonalStats` — new component for employee tab
7. Frontend: `EmployeeDashboard` — add "אזור אישי" tab
8. Frontend: `EmployeeTable` — add monthly hours per row
9. Commit + push

---

## Out of Scope
- Configurable shift start/end times
- Historical month navigation (employee sees current month only)
- Export to CSV
