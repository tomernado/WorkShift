import { Box, Paper, Typography, Chip } from '@mui/material';
import { ScheduleShift, Profile, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

interface Props {
  shifts: ScheduleShift[];
  employees: Profile[];
  currentEmployeeId?: string;
}

const SHIFT_TYPES: ShiftType[] = ['morning', 'evening'];

export default function WeeklyGrid({ shifts, employees, currentEmployeeId }: Props) {
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  function getShifts(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box display="grid" gridTemplateColumns="100px repeat(6, 1fr)" gap={0.5} minWidth={700}>
        <Box />
        {DAY_NAMES.map(d => (
          <Paper key={d} sx={{ p: 1, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
            <Typography variant="body2" fontWeight={700}>{d}</Typography>
          </Paper>
        ))}
        {SHIFT_TYPES.map(type => (
          <>
            <Paper key={`label-${type}`} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" fontWeight={500}>{SHIFT_LABELS[type]}</Typography>
            </Paper>
            {Array.from({ length: 6 }, (_, day) => (
              <Paper key={`${type}-${day}`} variant="outlined" sx={{ p: 1, minHeight: 64 }}>
                {getShifts(day, type).map(s => {
                  const emp = s.employee_id ? empMap[s.employee_id] : null;
                  const isMe = s.employee_id === currentEmployeeId;
                  return (
                    <Chip
                      key={s.id}
                      label={emp?.name ?? '—'}
                      size="small"
                      color={isMe ? 'primary' : 'default'}
                      sx={{ m: 0.25, opacity: s.employee_id ? 1 : 0.4 }}
                    />
                  );
                })}
              </Paper>
            ))}
          </>
        ))}
      </Box>
    </Box>
  );
}
