import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, AppBar, Toolbar, Button, Alert } from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile, ScheduleShift, Schedule } from '../types';
import WeeklyGrid from '../components/schedule/WeeklyGrid';
import ConstraintEditor from '../components/constraints/ConstraintEditor';

interface Props { profile: Profile; }

function getWeekStart(): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  return sunday.toISOString().split('T')[0];
}

export default function EmployeeDashboard({ profile }: Props) {
  const [tab, setTab] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []));

    supabase.from('schedules').select('*')
      .eq('week_start', getWeekStart()).eq('status', 'published').single()
      .then(({ data }) => {
        setSchedule(data ?? null);
        if (data) {
          supabase.from('schedule_shifts').select('*').eq('schedule_id', data.id)
            .then(({ data: s }) => setShifts(s ?? []));
        }
      });
  }, []);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>WorkShift — שלום {profile.name}</Typography>
          <Button color="inherit" onClick={() => supabase.auth.signOut()}>יציאה</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="המשמרות שלי" />
          <Tab label="הגשת משמרות" />
        </Tabs>
      </Box>
      <Box p={3}>
        {schedule?.announcement && (
          <Alert severity="info" sx={{ mb: 2, fontWeight: 500 }}>
            <Typography variant="body2" fontWeight={700} gutterBottom>הודעה מהמנהל:</Typography>
            <Typography variant="body2">{schedule.announcement}</Typography>
          </Alert>
        )}
        {tab === 0 && (
          schedule
            ? <WeeklyGrid shifts={shifts} employees={employees} currentEmployeeId={profile.id} />
            : <Typography color="text.secondary" textAlign="center" mt={4}>לוח המשמרות טרם פורסם</Typography>
        )}
        {tab === 1 && <ConstraintEditor profile={profile} />}
      </Box>
    </Box>
  );
}
