import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Chip, TextField, Divider,
  List, ListItem, ListItemButton, ListItemText, IconButton,
  Tooltip, Alert,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CloseIcon from '@mui/icons-material/Close';
import { Profile, ScheduleShift, ParsedConstraint, DAY_NAMES, SHIFT_LABELS, ShiftType, DAY_KEYS } from '../../types';

const apiUrl = import.meta.env.VITE_API_URL as string;

interface Props {
  open: boolean;
  scheduleId: string;
  day: number;
  shiftType: ShiftType;
  shifts: ScheduleShift[];          // all shifts for this slot
  employees: Profile[];             // all active employees
  constraints: Record<string, ParsedConstraint | null>;
  onClose: () => void;
  onSaved: () => void;
}

type SlotStatus = 'cannot_work' | 'prefer_not' | 'available';

function getSlotStatus(parsed: ParsedConstraint | null, day: number, shiftType: ShiftType): SlotStatus {
  if (!parsed) return 'available';
  const key = `${DAY_KEYS[day]}_${shiftType}`;
  if (parsed.cannot_work?.includes(key)) return 'cannot_work';
  if (parsed.prefer_not?.includes(key)) return 'prefer_not';
  return 'available';
}

const STATUS_LABELS: Record<SlotStatus, string> = {
  cannot_work: 'לא יכול',
  prefer_not: 'עדיף לא',
  available: 'פנוי',
};
const STATUS_COLORS: Record<SlotStatus, 'error' | 'warning' | 'success'> = {
  cannot_work: 'error',
  prefer_not: 'warning',
  available: 'success',
};

const JOB_LABELS: Record<string, string> = { waiter: 'מלצר', cook: 'טבח' };

export default function ShiftSlotPanel({ open, scheduleId, day, shiftType, shifts, employees, constraints, onClose, onSaved }: Props) {
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  // Local state per shift-row: employee_id overrides + notes + hours
  const [empOverrides, setEmpOverrides] = useState<Record<string, string>>({});
  const [empNotes, setEmpNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(shifts.map(s => [s.id, s.employee_note ?? '']))
  );
  const [hoursOverrides, setHoursOverrides] = useState<Record<string, number>>({});
  const [shiftNote, setShiftNote] = useState(shifts[0]?.shift_note ?? '');
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function getEmpId(shift: ScheduleShift) {
    return empOverrides[shift.id] ?? shift.employee_id ?? '';
  }

  async function save() {
    setSaving(true);
    for (const shift of shifts) {
      const body: Record<string, unknown> = {
        employeeNote: empNotes[shift.id] ?? '',
        shiftNote,
        scheduleId,
        dayOfWeek: day,
        shiftType,
        hours: hoursOverrides[shift.id] ?? shift.hours ?? 8,
      };
      const overrideEmp = empOverrides[shift.id];
      if (overrideEmp !== undefined) body.employeeId = overrideEmp;

      await fetch(`${apiUrl}/api/schedule/shifts/${shift.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  // Group shifts by job role
  const waiters = shifts.filter(s => {
    const emp = empMap[getEmpId(s)];
    return emp?.job_role === 'waiter';
  });
  const cooks = shifts.filter(s => {
    const emp = empMap[getEmpId(s)];
    return emp?.job_role === 'cook';
  });
  const unknown = shifts.filter(s => {
    const emp = empMap[getEmpId(s)];
    return !emp || (emp.job_role !== 'waiter' && emp.job_role !== 'cook');
  });

  function renderShiftRow(shift: ScheduleShift) {
    const empId = getEmpId(shift);
    const emp = empMap[empId];
    const status = getSlotStatus(constraints[empId] ?? null, day, shiftType);
    const isSwapping = swappingId === shift.id;

    return (
      <Box key={shift.id} sx={{ mb: 1.5 }}>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography fontWeight={700} fontSize={14}>
            {emp?.name ?? '⚠ חסר'}
          </Typography>
          {emp?.job_role && (
            <Chip label={JOB_LABELS[emp.job_role]} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          )}
          <Chip
            label={STATUS_LABELS[status]}
            color={STATUS_COLORS[status]}
            size="small"
            sx={{ fontSize: 11 }}
          />
          <Tooltip title="החלף עובד">
            <IconButton size="small" onClick={() => setSwappingId(isSwapping ? null : shift.id)}>
              <SwapHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {shift.is_conflict && (
          <Typography variant="caption" color="error.main" display="block">
            ⚠ {shift.conflict_reason}
          </Typography>
        )}

        {constraints[empId]?.notes && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
            הערת עובד: {constraints[empId]!.notes}
          </Typography>
        )}

        {isSwapping && (
          <Box sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 180, overflowY: 'auto' }}>
            <List dense disablePadding>
              {employees.map(e => {
                const s = getSlotStatus(constraints[e.id] ?? null, day, shiftType);
                return (
                  <ListItem key={e.id} disablePadding>
                    <ListItemButton
                      selected={empOverrides[shift.id] === e.id || (!empOverrides[shift.id] && shift.employee_id === e.id)}
                      onClick={() => {
                        setEmpOverrides(p => ({ ...p, [shift.id]: e.id }));
                        setSwappingId(null);
                      }}
                    >
                      <ListItemText
                        primary={e.name}
                        secondary={`${JOB_LABELS[e.job_role ?? ''] ?? ''} · ${STATUS_LABELS[s]}`}
                      />
                      <Chip label={STATUS_LABELS[s]} color={STATUS_COLORS[s]} size="small" sx={{ fontSize: 10 }} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}

        <Box display="flex" gap={1} mt={0.75} alignItems="flex-start">
          <TextField
            size="small"
            fullWidth
            label="הערה לעובד"
            value={empNotes[shift.id] ?? ''}
            onChange={e => setEmpNotes(p => ({ ...p, [shift.id]: e.target.value }))}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            size="small"
            label="שעות"
            type="number"
            value={hoursOverrides[shift.id] ?? shift.hours ?? 8}
            onChange={e => setHoursOverrides(p => ({ ...p, [shift.id]: parseFloat(e.target.value) || 8 }))}
            sx={{ width: 85, flexShrink: 0 }}
            slotProps={{ htmlInput: { min: 1, max: 12, step: 0.5 } }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography fontWeight={700}>{DAY_NAMES[day]} — {SHIFT_LABELS[shiftType]}</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {shifts.length === 0 && (
          <Alert severity="info">אין עובדים מוקצים למשמרת זו</Alert>
        )}

        {waiters.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary" fontWeight={700}>מלצרים</Typography>
            {waiters.map(renderShiftRow)}
          </>
        )}

        {cooks.length > 0 && (
          <>
            {waiters.length > 0 && <Divider sx={{ my: 1 }} />}
            <Typography variant="overline" color="text.secondary" fontWeight={700}>טבחים</Typography>
            {cooks.map(renderShiftRow)}
          </>
        )}

        {unknown.length > 0 && (
          <>
            {(waiters.length > 0 || cooks.length > 0) && <Divider sx={{ my: 1 }} />}
            {unknown.map(renderShiftRow)}
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="הערה כללית למשמרת"
          value={shiftNote}
          onChange={e => setShiftNote(e.target.value)}
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>ביטול</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? 'שומר...' : 'שמור'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
