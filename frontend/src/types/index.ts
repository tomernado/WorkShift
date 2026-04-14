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
  day_of_week: number;
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
  employee_id: string | null;
  day_of_week: number;
  shift_type: ShiftType;
  is_conflict: boolean;
  conflict_reason: string | null;
  profile?: Profile;
}

export type SlotKey = `${'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'}_${'morning' | 'evening'}`;

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: 'בוקר',
  evening: 'ערב',
};
