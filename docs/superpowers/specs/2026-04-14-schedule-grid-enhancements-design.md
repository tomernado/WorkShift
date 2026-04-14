# Schedule Grid Enhancements — Design Spec
**Date:** 2026-04-14  
**Status:** Approved

## Overview

Extend the `DraggableScheduleGrid` (manager view) with: manual employee swap, constraint-note visibility, per-employee notes, per-shift notes, visual role grouping, and a manager announcement system visible on the employee dashboard.

---

## 1. Database Migrations

Run in Supabase SQL editor before deployment:

```sql
ALTER TABLE schedule_shifts ADD COLUMN IF NOT EXISTS employee_note text;
ALTER TABLE schedule_shifts ADD COLUMN IF NOT EXISTS shift_note text;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS announcement text;
```

- `employee_note` — free-text note on a specific employee's assignment in a shift
- `shift_note` — general note for a shift slot (stored on every row of that slot; written/read together)
- `announcement` — manager's weekly announcement shown to employees

---

## 2. Feature: Role Grouping in Grid Cells

**Location:** `DraggableScheduleGrid` → `renderCell()`

Each cell currently shows a flat list of employee chips. Change to grouped display:

```
מלצרים: [אורי ✓] [מיכל ⚠]
טבחים:  [יוסי ✓]
```

- Group by `job_role` (waiter / cook) using `empMap`
- If a group is empty, show a dimmed "—" placeholder
- Conflict chip color (warning) stays as-is
- Clicking a chip or empty area opens `ShiftSlotPanel` (see §3)

---

## 3. Feature: ShiftSlotPanel (Dialog)

**New component:** `frontend/src/components/manager/ShiftSlotPanel.tsx`

Opened when manager clicks on any shift cell. Only available when schedule is in `draft` status.

### Props
```ts
interface Props {
  open: boolean;
  scheduleId: string;
  day: number;           // 0–5
  shiftType: ShiftType;
  shifts: ScheduleShift[];
  employees: Profile[];
  constraints: Record<string, ParsedConstraint | null>; // keyed by employee_id
  onClose: () => void;
  onSaved: () => void;   // reload parent after save
}
```

### Layout

**Header:** `{DAY_NAMES[day]} — {SHIFT_LABELS[shiftType]}`

**Section 1 — Employees (grouped by role):**

For each employee assigned to this slot:
- Name + job role chip
- Constraint indicator: green ✓ (available), yellow ⚠ (prefer_not), red ✗ (cannot_work)
- If `conflict_reason` is set: red alert text beneath name
- `employee_note` TextField (single line, optional)
- "החלף" (swap) button → opens `EmployeePicker` (see §4)

**Section 2 — Shift Note:**
- `TextField` multiline, label "הערה כללית למשמרת"
- Shared across all rows of this slot

**Footer actions:** "ביטול" | "שמור"

### Save logic
- For each shift row: `PATCH /api/schedule/shifts/{id}` with `{ employeeNote, shiftNote }`  
  (extend existing PATCH endpoint)
- If employee was swapped: include `employeeId` in same PATCH call
- After save: call `onSaved()` → parent reloads shifts

---

## 4. Feature: EmployeePicker (sub-component)

**Inline within ShiftSlotPanel** — shown in place of the employee row when "החלף" is clicked.

- List of all active employees (from `props.employees`)
- Each item shows: name, job_role chip, constraint status for this slot
- Clicking an item selects the new employee (staged, not saved yet)
- "ביטול" resets to original employee

---

## 5. Feature: Manager Announcement

**Location in manager:** New "הודעות" tab in `ManagerDashboard`

**New component:** `frontend/src/components/manager/AnnouncementEditor.tsx`
- Week selector (same as `ConstraintsOverview`)
- `TextField` multiline, label "הודעה לעובדים לשבוע זה"
- "שמור" button → `PATCH schedules` row for selected week via Supabase client
- Shows current saved announcement if exists

**Location in employee:** Top of `EmployeeDashboard`, above the weekly schedule
- Fetch `schedules.announcement` for current week
- If non-empty: `Alert` component with severity `info`, text of announcement
- If empty: nothing rendered

---

## 6. Backend Changes

### Extend `ShiftsController` PATCH endpoint

`PATCH /api/schedule/shifts/{id}` currently accepts `{ dayOfWeek, shiftType }`.

Extend to also accept:
```json
{
  "dayOfWeek": 2,
  "shiftType": "morning",
  "employeeId": "uuid-or-null",
  "employeeNote": "text",
  "shiftNote": "text"
}
```

All fields optional. Only update fields that are present in the request body.

When `shiftNote` is provided, update **all** rows in `schedule_shifts` with the same `(schedule_id, day_of_week, shift_type)` — so the note stays consistent across the slot.

---

## 7. TypeScript Type Updates

```ts
// index.ts
interface ScheduleShift {
  // existing fields ...
  employee_note: string | null;  // ADD
  shift_note: string | null;     // ADD
}

interface Schedule {
  // existing fields ...
  announcement: string | null;   // ADD
}
```

---

## 8. Component Tree After Changes

```
ManagerDashboard
  Tab: עובדים       → EmployeeTable
  Tab: דרישות משמרת → ShiftRequirementsGrid
  Tab: אילוצי עובדים → ConstraintsOverview
  Tab: לוח משמרות   → DraggableScheduleGrid
                         ShiftSlotPanel (dialog, on cell click)
                           EmployeePicker (inline swap)
  Tab: הודעות       → AnnouncementEditor   ← NEW

EmployeeDashboard
  AnnouncementBanner (Alert, if announcement exists)  ← NEW
  Tab: המשמרות שלי  → WeeklyGrid
  Tab: הגשת משמרות  → ConstraintEditor
```

---

## 9. Out of Scope

- Push notifications to employees when announcement is posted
- History of past announcements
- Per-employee announcement read receipts
- Shift role sub-assignments beyond waiter/cook grouping
