import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableBody,
  TableRow, TableCell, TextField, Switch, FormControlLabel,
  Button, CircularProgress, Alert, useTheme, useMediaQuery,
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { DAY_NAMES, ShiftType, SHIFT_LABELS } from '../../types';
import { format, addDays } from 'date-fns';

interface SlotOverride {
  closed: boolean;
  waiters: number;
  cooks: number;
}

type OverrideGrid = Record<string, SlotOverride>; // key: "YYYY-MM-DD__morning"

const SHIFTS: ShiftType[] = ['morning', 'evening'];

interface Props {
  weekStart: string; // 'YYYY-MM-DD'
  onSaved: () => void;
}

export default function WeeklyOverridePanel({ weekStart, onSaved }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [defaults, setDefaults] = useState<Record<string, { waiters: number; cooks: number }>>({});
  const [overrides, setOverrides] = useState<OverrideGrid>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Build date array for the week: Sun–Fri (6 days)
  const weekDates = Array.from({ length: 6 }, (_, i) =>
    format(addDays(new Date(weekStart), i), 'yyyy-MM-dd')
  );

  useEffect(() => {
    // Load default requirements (target_date IS NULL)
    supabase.from('shift_requirements')
      .select('day_of_week,shift_type,required_waiters,required_cooks')
      .is('target_date', null)
      .then(({ data }) => {
        const map: Record<string, { waiters: number; cooks: number }> = {};
        (data ?? []).forEach((r: { day_of_week: number; shift_type: string; required_waiters: number; required_cooks: number }) => {
          map[`${r.day_of_week}__${r.shift_type}`] = {
            waiters: r.required_waiters,
            cooks: r.required_cooks,
          };
        });
        setDefaults(map);
      });

    // Load existing target_date overrides for this week
    supabase.from('shift_requirements')
      .select('target_date,shift_type,required_waiters,required_cooks')
      .in('target_date', weekDates)
      .then(({ data }) => {
        const grid: OverrideGrid = {};
        (data ?? []).forEach((r: { target_date: string; shift_type: string; required_waiters: number; required_cooks: number }) => {
          const key = `${r.target_date}__${r.shift_type}`;
          grid[key] = {
            closed: r.required_waiters === 0 && r.required_cooks === 0,
            waiters: r.required_waiters,
            cooks: r.required_cooks,
          };
        });
        setOverrides(grid);
      });
  }, [weekStart]);

  function getSlot(date: string, shift: ShiftType): SlotOverride {
    const overrideKey = `${date}__${shift}`;
    if (overrides[overrideKey]) return overrides[overrideKey];
    // Fall back to default for this day-of-week
    const dayIndex = weekDates.indexOf(date);
    const defKey = `${dayIndex}__${shift}`;
    const def = defaults[defKey];
    return { closed: false, waiters: def?.waiters ?? 0, cooks: def?.cooks ?? 0 };
  }

  function setSlot(date: string, shift: ShiftType, patch: Partial<SlotOverride>) {
    const key = `${date}__${shift}`;
    setOverrides(prev => ({
      ...prev,
      [key]: { ...getSlot(date, shift), ...patch },
    }));
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      // Step 1: delete all existing target_date overrides for this week
      // (prevents duplicate rows since shift_requirements may lack a unique constraint)
      const { error: delErr } = await supabase
        .from('shift_requirements')
        .delete()
        .in('target_date', weekDates);
      if (delErr) throw new Error(delErr.message);

      // Step 2: insert fresh override rows for each slot
      const rows = weekDates.flatMap((date, dayIndex) =>
        SHIFTS.map(shift => {
          const slot = getSlot(date, shift);
          return {
            target_date: date,
            day_of_week: dayIndex,
            shift_type: shift,
            required_waiters: slot.closed ? 0 : slot.waiters,
            required_cooks: slot.closed ? 0 : slot.cooks,
          };
        })
      );
      const { error: insErr } = await supabase
        .from('shift_requirements')
        .insert(rows);
      if (insErr) throw new Error(insErr.message);

      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    }
    setSaving(false);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
        הגדרות שבוע זה — דגשים חד-פעמיים
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={2}>
        שינויים כאן חלים על שבוע זה בלבד ולא משנים את ברירת המחדל הקבועה
      </Typography>

      <Table size="small" sx={{ overflowX: isMobile ? 'visible' : 'auto' }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'primary.main' }}>
            <TableCell sx={{ color: 'white', fontWeight: 700, width: isMobile ? 56 : 60 }} />
            {isMobile
              ? SHIFTS.map(s => (
                  <TableCell key={s} align="center" sx={{ color: 'white', fontWeight: 700 }}>
                    {SHIFT_LABELS[s]}
                  </TableCell>
                ))
              : DAY_NAMES.map((d, i) => (
                  <TableCell key={i} align="center" sx={{ color: 'white', fontWeight: 700 }}>{d}</TableCell>
                ))
            }
          </TableRow>
        </TableHead>
        <TableBody>
          {isMobile
            // Mobile: rows = days, columns = morning / evening
            ? weekDates.map((date, dayIndex) => (
                <TableRow key={date}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'top', pt: 1 }}>
                    {DAY_NAMES[dayIndex]}
                  </TableCell>
                  {SHIFTS.map(shift => {
                    const slot = getSlot(date, shift);
                    return (
                      <TableCell key={shift} sx={{ p: 0.5, verticalAlign: 'top' }}>
                        <Box sx={{
                          p: 0.75, borderRadius: 1,
                          bgcolor: slot.closed ? '#fff3e0' : 'grey.50',
                          border: '1px solid',
                          borderColor: slot.closed ? 'warning.light' : 'divider',
                        }}>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={slot.closed}
                                onChange={e => setSlot(date, shift, { closed: e.target.checked })}
                                color="warning"
                              />
                            }
                            label={<Typography variant="caption">{slot.closed ? 'סגור' : 'פתוח'}</Typography>}
                            sx={{ ml: 0, mr: 0, mb: slot.closed ? 0 : 0.5 }}
                          />
                          {!slot.closed && (
                            <Box display="flex" gap={0.5} mt={0.25}>
                              <TextField
                                label="מלצ'" type="number" size="small"
                                value={slot.waiters}
                                onChange={e => setSlot(date, shift, { waiters: parseInt(e.target.value) || 0 })}
                                sx={{ width: 56 }}
                                slotProps={{ htmlInput: { min: 0, max: 10, style: { padding: '4px 4px', fontSize: 12 } } }}
                              />
                              <TextField
                                label="טבח'" type="number" size="small"
                                value={slot.cooks}
                                onChange={e => setSlot(date, shift, { cooks: parseInt(e.target.value) || 0 })}
                                sx={{ width: 56 }}
                                slotProps={{ htmlInput: { min: 0, max: 10, style: { padding: '4px 4px', fontSize: 12 } } }}
                              />
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            // Desktop: rows = morning/evening, columns = days
            : SHIFTS.map(shift => (
                <TableRow key={shift}>
                  <TableCell sx={{ fontWeight: 600 }}>{SHIFT_LABELS[shift]}</TableCell>
                  {weekDates.map((date, dayIndex) => {
                    const slot = getSlot(date, shift);
                    return (
                      <TableCell key={dayIndex} sx={{ p: 0.5, minWidth: 110, verticalAlign: 'top' }}>
                        <Box sx={{
                          p: 1, borderRadius: 1,
                          bgcolor: slot.closed ? '#fff3e0' : 'grey.50',
                          border: '1px solid',
                          borderColor: slot.closed ? 'warning.light' : 'divider',
                        }}>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={slot.closed}
                                onChange={e => setSlot(date, shift, { closed: e.target.checked })}
                                color="warning"
                              />
                            }
                            label={<Typography variant="caption">{slot.closed ? 'סגור' : 'פתוח'}</Typography>}
                            sx={{ mb: slot.closed ? 0 : 0.5, ml: 0, mr: 0 }}
                          />
                          {!slot.closed && (
                            <Box display="flex" gap={0.5} mt={0.5}>
                              <TextField
                                label="מלצרים" type="number" size="small"
                                value={slot.waiters}
                                onChange={e => setSlot(date, shift, { waiters: parseInt(e.target.value) || 0 })}
                                sx={{ width: 58 }}
                                slotProps={{ htmlInput: { min: 0, max: 10, style: { padding: '4px 6px', fontSize: 12 } } }}
                              />
                              <TextField
                                label="טבחים" type="number" size="small"
                                value={slot.cooks}
                                onChange={e => setSlot(date, shift, { cooks: parseInt(e.target.value) || 0 })}
                                sx={{ width: 58 }}
                                slotProps={{ htmlInput: { min: 0, max: 10, style: { padding: '4px 6px', fontSize: 12 } } }}
                              />
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
          }
        </TableBody>
      </Table>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mt: 2 }}>✓ נשמר</Alert>}

      <Button
        variant="contained" sx={{ mt: 2 }}
        onClick={save} disabled={saving}
      >
        {saving ? <CircularProgress size={18} color="inherit" /> : 'שמור הגדרות שבוע'}
      </Button>
    </Paper>
  );
}
