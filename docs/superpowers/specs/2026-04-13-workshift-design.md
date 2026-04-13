# WorkShift — Design Spec
**Date:** 2026-04-13  
**Status:** Approved

---

## Overview

WorkShift is a full-stack employee scheduling application for small businesses (~5–15 employees). It allows employees to submit shift constraints in natural language (parsed by Claude AI) and enables managers to auto-generate, review, and publish weekly schedules.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + MUI v5 |
| Backend | .NET 8 Web API (C#) |
| Database & Auth | Supabase (PostgreSQL + Supabase Auth) |
| AI | Anthropic Claude API (constraint parsing) |

---

## Repository Structure

```
/workshift
  /frontend        → React SPA
  /backend         → .NET 8 Web API
  /database        → SQL migration files
  /docs            → Design docs and specs
```

---

## Authentication

- Supabase Auth with email/password
- Manager creates employees; employee email = `<name>@workshift.local` (internal convention)
- Default password: `0000` (reset on first login is out of scope for MVP)
- Two roles: `employee`, `manager` — stored in `profiles.role`
- Row Level Security (RLS) enforced in Supabase: employees see only their own constraints and published schedules

---

## Database Schema

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | References auth.users |
| name | text | Display name |
| role | text | `employee` / `manager` |
| job_role | text | `waiter` / `cook` |
| is_active | boolean | Soft delete |
| created_at | timestamptz | |

### `shift_requirements`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| day_of_week | int | 0=Sun … 5=Fri (no Saturday) |
| shift_type | text | `morning` / `evening` |
| required_waiters | int | |
| required_cooks | int | |
| target_date | date (nullable) | Optional override for a specific date (e.g. special events) |

**Resolution logic:** During schedule generation, if a `shift_requirements` row exists with a matching `target_date`, it takes precedence over the default `day_of_week` row for that date. This allows staffing overrides for special occasions without changing the weekly defaults.

### `constraints`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| employee_id | uuid (FK → profiles) | |
| week_start | date | Monday of the target week |
| raw_text | text | Free-text input from employee |
| parsed_json | jsonb | Structured output from AI |
| status | text | `pending` / `approved` / `rejected` |
| created_at | timestamptz | |

**parsed_json structure:**
```json
{
  "cannot_work": ["sunday_morning", "monday_evening"],
  "prefer_not": ["tuesday_morning"],
  "prefer": ["wednesday_evening"],
  "notes": "optional free text remainder"
}
```

### `schedules`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| week_start | date | |
| status | text | `draft` / `published` |
| created_at | timestamptz | |

### `schedule_shifts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| schedule_id | uuid (FK → schedules) | |
| employee_id | uuid (FK → profiles) | |
| day_of_week | int | 0–5 |
| shift_type | text | `morning` / `evening` |
| is_conflict | boolean | True if constraint was violated |
| conflict_reason | text | Human-readable explanation |

---

## Backend API

### `POST /api/constraints/parse`
**Request:**
```json
{ "text": "אני לא יכול ביום שלישי בבוקר ועדיף לא ביום רביעי" }
```
**Response:**
```json
{
  "cannot_work": ["tuesday_morning"],
  "prefer_not": ["wednesday_morning", "wednesday_evening"],
  "prefer": [],
  "notes": ""
}
```
Calls Claude API with a system prompt that maps Hebrew/English free text to the structured schema.

### `POST /api/schedule/generate`
**Request:**
```json
{ "week_start": "2026-04-20" }
```
**Response:**
```json
{
  "schedule_id": "uuid",
  "conflict_count": 2,
  "shifts": [ ... ]
}
```

**Scheduling Algorithm (greedy with rotation):**
1. Load all active employees and their approved constraints for the week
2. For each day (Sun–Fri), for each shift (morning, evening):
   - Filter eligible employees by job_role and constraint (cannot_work = hard block)
   - Sort by: fewest shifts assigned this week first (rotation fairness)
   - Fill required_waiters + required_cooks slots
   - If a slot cannot be filled without violating a `prefer_not`, mark `is_conflict = true`
   - If a slot cannot be filled at all, mark `is_conflict = true` with reason "understaffed"
3. Save as `draft` schedule to Supabase
4. Return result with conflict summary

### `PATCH /api/schedule/shifts/:id`
Updates a single `schedule_shifts` row after a manager drag & drop action.  
**Request:** `{ "employee_id": "uuid", "day_of_week": 2, "shift_type": "morning" }`  
**Response:** Updated shift row including recalculated `is_conflict` and `conflict_reason`.

**Business Rules enforced:**
- 8h rest between shifts (morning ends 14:00, evening starts 22:00 — no employee works morning + evening same day)
- Max 5 shifts per week per employee
- Role-based assignment (waiters fill waiter slots, cooks fill cook slots)

---

## Frontend Screens

### Login Page
- Name selector (dropdown of active employees) + password field
- Supabase Auth call on submit

### Employee Dashboard
- **My Schedule tab:** Weekly grid (Sun–Fri × Morning/Evening), shows employee's assigned shifts after publish. Unassigned cells are greyed out.
- **My Constraints tab:**
  1. Textarea for free-text input + "Parse" button → calls `/api/constraints/parse`
  2. On success: renders an **editable constraint grid** — a 6×2 matrix (Sun–Fri × Morning/Evening) where each cell is a Chip with three states: `cannot_work` (red), `prefer_not` (yellow), `available` (green/default). The AI result pre-populates the chips; the employee can click any chip to cycle through states to correct the AI's interpretation.
  3. "Submit" button serializes the corrected grid back to `parsed_json` format and saves to DB.

### Manager Dashboard
- **Employees tab:** Table of all employees, Add/Edit/Deactivate actions.
- **Shift Requirements tab:** Grid to set required_waiters + required_cooks per day/shift.
- **Schedule tab:**
  - Week picker
  - "Generate" button → calls backend, renders draft grid
  - Conflict cells highlighted in amber with tooltip showing reason
  - **Drag & Drop override:** Manager can drag an employee chip from one cell to another within the draft grid. Each drop triggers a `PATCH /api/schedule/shifts/:id` call (or direct Supabase upsert) to update `schedule_shifts` in real-time. Dropped cells re-evaluate conflict status client-side (check constraints) and update highlighting immediately.
  - "Publish" button → changes schedule status to `published`

---

## Error Handling

- AI parsing failure → show raw text back to user with message "לא הצלחנו לפרסם, אנא נסח מחדש"
- Schedule generation with 0 eligible employees for a slot → mark as conflict "אין עובדים זמינים"
- Supabase auth failure → show inline error on login form

---

## Out of Scope (MVP)

- Password reset flow
- Push notifications
- Multi-business / multi-manager support
- Mobile app
- Shift swap requests between employees
