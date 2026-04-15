import { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Divider, Chip } from '@mui/material';
import { supabase } from '../../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface Props {
  employeeId: string;
}

interface MonthStats {
  totalShifts: number;
  totalHours: number;
  morningShifts: number;
  eveningShifts: number;
}

async function fetchMonthStats(employeeId: string, monthDate: Date): Promise<MonthStats> {
  const monthStart = format(startOfMonth(monthDate), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd');

  const { data: schedules } = await supabase
    .from('schedules')
    .select('id')
    .eq('status', 'published')
    .gte('week_start', monthStart)
    .lte('week_start', monthEnd);

  if (!schedules || schedules.length === 0)
    return { totalShifts: 0, totalHours: 0, morningShifts: 0, eveningShifts: 0 };

  const scheduleIds = schedules.map((s: { id: string }) => s.id);

  const { data: shifts } = await supabase
    .from('schedule_shifts')
    .select('shift_type, hours')
    .eq('employee_id', employeeId)
    .in('schedule_id', scheduleIds);

  const rows = (shifts ?? []) as { shift_type: string; hours: number | null }[];
  return {
    totalShifts: rows.length,
    totalHours: rows.reduce((sum, s) => sum + (s.hours ?? 8), 0),
    morningShifts: rows.filter(s => s.shift_type === 'morning').length,
    eveningShifts: rows.filter(s => s.shift_type === 'evening').length,
  };
}

export default function PersonalStats({ employeeId }: Props) {
  const now = new Date();
  const [current, setCurrent] = useState<MonthStats | null>(null);
  const [previous, setPrevious] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchMonthStats(employeeId, now),
      fetchMonthStats(employeeId, subMonths(now, 1)),
    ]).then(([curr, prev]) => {
      setCurrent(curr);
      setPrevious(prev);
      setLoading(false);
    });
  }, [employeeId]);

  const currentMonthLabel = format(now, 'MM/yyyy');
  const prevMonthLabel = format(subMonths(now, 1), 'MM/yyyy');

  if (loading) return <CircularProgress size={24} sx={{ display: 'block', my: 4, mx: 'auto' }} />;

  const hoursDelta = current && previous ? current.totalHours - previous.totalHours : 0;

  return (
    <Box maxWidth={480}>
      <Typography variant="h6" mb={2}>האזור האישי שלי</Typography>

      {/* Current month */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
          חודש {currentMonthLabel}
        </Typography>
        <Box display="flex" gap={4} flexWrap="wrap" mb={1.5}>
          <Box textAlign="center">
            <Typography variant="h3" fontWeight={700} color="primary">
              {current?.totalShifts ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">משמרות</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h3" fontWeight={700} color="primary">
              {current?.totalHours ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">שעות</Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 1.5 }} />
        <Box display="flex" gap={1} flexWrap="wrap">
          <Chip label={`בוקר: ${current?.morningShifts ?? 0}`} size="small" variant="outlined" />
          <Chip label={`ערב: ${current?.eveningShifts ?? 0}`} size="small" variant="outlined" />
          {hoursDelta !== 0 && (
            <Chip
              label={`${hoursDelta > 0 ? '+' : ''}${hoursDelta} שעות לעומת חודש קודם`}
              size="small"
              color={hoursDelta > 0 ? 'success' : 'default'}
              variant="outlined"
            />
          )}
        </Box>
      </Paper>

      {/* Previous month summary */}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Typography variant="caption" color="text.secondary">
          חודש {prevMonthLabel}: {previous?.totalShifts ?? 0} משמרות · {previous?.totalHours ?? 0} שעות
        </Typography>
      </Paper>
    </Box>
  );
}
