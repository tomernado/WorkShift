import { useState, useEffect } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, IconButton, Chip, Alert, Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Profile, JobRole } from '../../types';

const JOB_ROLE_LABELS: Record<JobRole, string> = { waiter: 'מלצר', cook: 'טבח' };

export default function EmployeeTable() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Profile & { password: string }>>({});
  const [saveError, setSaveError] = useState('');
  const [monthlyHours, setMonthlyHours] = useState<Record<string, number>>({});

  useEffect(() => { load(); loadMonthlyHours(); }, []);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').neq('role', 'manager').order('name');
    setEmployees(data ?? []);
  }

  async function loadMonthlyHours() {
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const { data: schedules } = await supabase
      .from('schedules')
      .select('id')
      .eq('status', 'published')
      .gte('week_start', monthStart)
      .lte('week_start', monthEnd);

    if (!schedules?.length) return;

    const { data: shifts } = await supabase
      .from('schedule_shifts')
      .select('employee_id, hours')
      .in('schedule_id', schedules.map((s: { id: string }) => s.id))
      .not('employee_id', 'is', null);

    const map: Record<string, number> = {};
    (shifts ?? []).forEach((s: { employee_id: string | null; hours: number | null }) => {
      if (s.employee_id)
        map[s.employee_id] = (map[s.employee_id] ?? 0) + (s.hours ?? 8);
    });
    setMonthlyHours(map);
  }

  function openNew() { setEditing({ role: 'employee', is_active: true }); setSaveError(''); setOpen(true); }
  function openEdit(e: Profile) { setEditing(e); setSaveError(''); setOpen(true); }

  async function save() {
    setSaveError('');
    const apiUrl = (import.meta.env.VITE_API_URL as string) || '';
    if (editing.id) {
      await supabase.from('profiles').update({
        name: editing.name,
        job_role: editing.job_role,
        is_active: editing.is_active,
      }).eq('id', editing.id);
      if (editing.password && editing.password.length >= 4) {
        const res = await fetch(`${apiUrl}/api/employees/${editing.id}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: editing.password }),
        });
        if (!res.ok) {
          const errText = await res.text();
          setSaveError(`שגיאה בשינוי קוד: ${errText}`);
          return;
        }
      }
    } else {
      const res = await fetch(`${apiUrl}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, jobRole: editing.job_role }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setSaveError(`שגיאה ביצירת עובד: ${errText}`);
        return;
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
                <TableCell>
                  <Box>
                    <Typography variant="body2">{e.name}</Typography>
                    {monthlyHours[e.id] !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        {monthlyHours[e.id]} שעות החודש
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>{e.job_role ? JOB_ROLE_LABELS[e.job_role] : '—'}</TableCell>
                <TableCell>
                  <Chip label={e.is_active ? 'פעיל' : 'לא פעיל'}
                    color={e.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => openEdit(e)}><EditIcon fontSize="small" /></IconButton>
                  {e.is_active && (
                    <IconButton size="small" onClick={() => deactivate(e.id)}><PersonOffIcon fontSize="small" /></IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editing.id ? 'עריכת עובד' : 'הוספת עובד'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {saveError && <Alert severity="error">{saveError}</Alert>}
          <TextField
            label="שם" value={editing.name ?? ''}
            onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
          />
          <FormControl>
            <InputLabel>תפקיד</InputLabel>
            <Select value={editing.job_role ?? ''} label="תפקיד"
              onChange={e => setEditing(p => ({ ...p, job_role: e.target.value as JobRole }))}>
              <MenuItem value="waiter">מלצר</MenuItem>
              <MenuItem value="cook">טבח</MenuItem>
            </Select>
          </FormControl>
          {editing.id && (
            <TextField
              label="קוד כניסה חדש"
              helperText="השאר ריק כדי לא לשנות. לפחות 4 ספרות."
              value={editing.password ?? ''}
              inputProps={{ maxLength: 8 }}
              onChange={e => setEditing(p => ({ ...p, password: e.target.value }))}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={save}>שמור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
