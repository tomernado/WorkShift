import { useState, useEffect } from 'react';
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel,
  TextField, Button, Alert, CircularProgress, Paper, Chip,
  Table, TableHead, TableBody, TableRow, TableCell, Tooltip,
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { Profile, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

const apiUrl = (import.meta.env.VITE_API_URL as string) || '';

const SHIFTS: ShiftType[] = ['morning', 'evening'];
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

interface PermanentConstraint {
  min_shifts_per_week: number;
  max_shifts_per_week: number;
  cannot_work: string[];
}

const DEFAULT: PermanentConstraint = {
  min_shifts_per_week: 0,
  max_shifts_per_week: 5,
  cannot_work: [],
};

export default function PermanentConstraintsEditor() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [constraint, setConstraint] = useState<PermanentConstraint>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id,name,job_role,role,is_active,created_at')
      .eq('is_active', true).neq('role', 'manager').order('name')
      .then(({ data }) => setEmployees((data ?? []) as Profile[]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setSaved(false);
    setError('');
    fetch(`${apiUrl}/api/employees/${selectedId}/permanent-constraint`)
      .then(r => r.json())
      .then(data => {
        setConstraint({
          min_shifts_per_week: data.min_shifts_per_week ?? 0,
          max_shifts_per_week: data.max_shifts_per_week ?? 5,
          cannot_work: data.cannot_work ?? [],
        });
      })
      .catch(() => setConstraint(DEFAULT))
      .finally(() => setLoading(false));
  }, [selectedId]);

  function toggleSlot(slotKey: string) {
    setConstraint(prev => ({
      ...prev,
      cannot_work: prev.cannot_work.includes(slotKey)
        ? prev.cannot_work.filter(s => s !== slotKey)
        : [...prev.cannot_work, slotKey],
    }));
  }

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`${apiUrl}/api/employees/${selectedId}/permanent-constraint`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(constraint),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    }
    setSaving(false);
  }

  const selected = employees.find(e => e.id === selectedId);

  return (
    <Box maxWidth={700} mx="auto">
      <Typography variant="h6" mb={1}>אילוצים קבועים לעובד</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        הגדרות שחלות בכל שבוע, ללא תלות באילוצים שהעובד שולח
      </Typography>

      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>בחר עובד</InputLabel>
        <Select value={selectedId} label="בחר עובד" onChange={e => setSelectedId(e.target.value)}>
          {employees.map(e => (
            <MenuItem key={e.id} value={e.id}>
              {e.name} {e.job_role ? `(${e.job_role === 'waiter' ? 'מלצר' : 'טבח'})` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedId && loading && <CircularProgress size={24} sx={{ display: 'block', my: 3 }} />}

      {selectedId && !loading && (
        <>
          {/* Min / Max shifts */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              מספר משמרות בשבוע עבור {selected?.name}
            </Typography>
            <Box display="flex" gap={3} flexWrap="wrap">
              <TextField
                label="מינימום משמרות"
                type="number"
                size="small"
                value={constraint.min_shifts_per_week}
                onChange={e => setConstraint(p => ({ ...p, min_shifts_per_week: Math.max(0, parseInt(e.target.value) || 0) }))}
                helperText="העובד יקבל עדיפות לקבל לפחות כמה משמרות"
                sx={{ width: 180 }}
                slotProps={{ htmlInput: { min: 0, max: 6 } }}
              />
              <TextField
                label="מקסימום משמרות"
                type="number"
                size="small"
                value={constraint.max_shifts_per_week}
                onChange={e => setConstraint(p => ({ ...p, max_shifts_per_week: Math.min(6, Math.max(1, parseInt(e.target.value) || 5)) }))}
                helperText="העובד לא יקבל יותר ממספר זה"
                sx={{ width: 180 }}
                slotProps={{ htmlInput: { min: 1, max: 6 } }}
              />
            </Box>
          </Paper>

          {/* Permanent blocked slots */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1}>
              משמרות חסומות לצמיתות
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={2}>
              לחץ על תא כדי לחסום — העובד לא ישובץ לעולם בזמנים אלו
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 700, width: 70 }} />
                    {DAY_NAMES.map(d => (
                      <TableCell key={d} align="center" sx={{ color: 'white', fontWeight: 700 }}>{d}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {SHIFTS.map(shift => (
                    <TableRow key={shift}>
                      <TableCell sx={{ fontWeight: 600 }}>{SHIFT_LABELS[shift]}</TableCell>
                      {DAY_KEYS.map((dayKey, dayIdx) => {
                        const slotKey = `${dayKey}_${shift}`;
                        const blocked = constraint.cannot_work.includes(slotKey);
                        return (
                          <TableCell key={dayIdx} align="center" sx={{ p: 0.5 }}>
                            <Tooltip title={blocked ? 'חסום — לחץ לשחרור' : 'פנוי — לחץ לחסימה'}>
                              <Box
                                onClick={() => toggleSlot(slotKey)}
                                sx={{
                                  width: 36, height: 36,
                                  borderRadius: 1,
                                  cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  bgcolor: blocked ? 'error.main' : 'grey.100',
                                  color: blocked ? 'white' : 'text.disabled',
                                  fontSize: 16,
                                  transition: 'all 0.15s ease',
                                  '&:hover': {
                                    bgcolor: blocked ? 'error.dark' : 'grey.300',
                                    transform: 'scale(1.1)',
                                  },
                                }}
                              >
                                {blocked ? '✕' : ''}
                              </Box>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {constraint.cannot_work.length > 0 && (
              <Box mt={1.5} display="flex" flexWrap="wrap" gap={0.5}>
                {constraint.cannot_work.map(slot => (
                  <Chip key={slot} label={slot} size="small" color="error" variant="outlined"
                    onDelete={() => toggleSlot(slot)} />
                ))}
              </Box>
            )}
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {saved && <Alert severity="success" sx={{ mb: 2 }}>✓ נשמר בהצלחה</Alert>}

          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'שמור אילוצים קבועים'}
          </Button>
        </>
      )}
    </Box>
  );
}
