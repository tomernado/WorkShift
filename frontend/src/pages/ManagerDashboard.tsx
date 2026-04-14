import { useState } from 'react';
import { Box, Tabs, Tab, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import EmployeeTable from '../components/manager/EmployeeTable';
import ShiftRequirementsGrid from '../components/manager/ShiftRequirementsGrid';
import DraggableScheduleGrid from '../components/manager/DraggableScheduleGrid';
import ConstraintsOverview from '../components/manager/ConstraintsOverview';
import AnnouncementEditor from '../components/manager/AnnouncementEditor';

interface Props { profile: Profile; }

export default function ManagerDashboard({ profile }: Props) {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>WorkShift — ניהול ({profile.name})</Typography>
          <Button color="inherit" onClick={() => supabase.auth.signOut()}>יציאה</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered variant="scrollable" scrollButtons="auto">
          <Tab label="עובדים" />
          <Tab label="דרישות משמרת" />
          <Tab label="אילוצי עובדים" />
          <Tab label="לוח משמרות" />
          <Tab label="הודעות" />
        </Tabs>
      </Box>
      <Box p={3}>
        {tab === 0 && <EmployeeTable />}
        {tab === 1 && <ShiftRequirementsGrid />}
        {tab === 2 && <ConstraintsOverview />}
        {tab === 3 && <DraggableScheduleGrid />}
        {tab === 4 && <AnnouncementEditor />}
      </Box>
    </Box>
  );
}
