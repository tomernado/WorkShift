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
  const [editing, setEditing] = useState<Partial<Profile & { password: string }>>({});

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
        name: editing.name,
        job_role: editing.job_role,
        is_active: editing.is_active,
      }).eq('id', editing.id);
    } else {
      // Create Supabase Auth user — requires service role key on backend
      // For MVP: call backend endpoint or use admin API
      const email = `${(editing.name ?? '').replace(/\s+/g, '.')}@workshift.local`;
      const { data: authData, error } = await supabase.auth.admin.createUser({
        email,
        password: '0000',
        user_metadata: { name: editing.name },
        email_confirm: true,
      });
      if (error) { console.error('Create user error:', error); return; }
      if (authData.user) {
        await supabase.from('profiles').update({
          name: editing.name,
          role: 'employee',
          job_role: editing.job_role,
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={save}>שמור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
