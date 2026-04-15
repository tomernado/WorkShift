import {
  Paper, Typography, Chip,
  Table, TableHead, TableBody, TableRow, TableCell,
  useMediaQuery, useTheme,
} from '@mui/material';
import { ScheduleShift, Profile, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

interface Props {
  shifts: ScheduleShift[];
  employees: Profile[];
  currentEmployeeId?: string;
}

const SHIFT_TYPES: ShiftType[] = ['morning', 'evening'];

export default function WeeklyGrid({ shifts, employees, currentEmployeeId }: Props) {
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  function getShifts(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  function renderChips(day: number, type: ShiftType) {
    const dayShifts = getShifts(day, type);
    if (dayShifts.length === 0)
      return <Typography variant="caption" color="text.disabled">—</Typography>;
    return dayShifts.map(s => {
      const emp = s.employee_id ? empMap[s.employee_id] : null;
      const isMe = s.employee_id === currentEmployeeId;
      return (
        <Chip
          key={s.id}
          label={emp?.name ?? '—'}
          size="small"
          color={isMe ? 'primary' : 'default'}
          sx={{ m: 0.25, opacity: s.employee_id ? 1 : 0.4, fontSize: 11 }}
        />
      );
    });
  }

  if (isMobile) {
    /* Mobile: days as rows, shifts as columns */
    return (
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>יום</TableCell>
              {SHIFT_TYPES.map(t => (
                <TableCell key={t} align="center" sx={{ color: 'white', fontWeight: 700 }}>
                  {SHIFT_LABELS[t]}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {DAY_NAMES.map((name, day) => (
              <TableRow key={day}>
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</TableCell>
                {SHIFT_TYPES.map(type => (
                  <TableCell key={type} sx={{ p: 0.75, verticalAlign: 'top' }}>
                    {renderChips(day, type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  }

  /* Desktop: days as columns, shifts as rows */
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
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
          {SHIFT_TYPES.map(type => (
            <TableRow key={type}>
              <TableCell sx={{ fontWeight: 600 }}>{SHIFT_LABELS[type]}</TableCell>
              {Array.from({ length: 6 }, (_, day) => (
                <TableCell key={day} sx={{ p: 0.75, minWidth: 90, verticalAlign: 'top' }}>
                  {renderChips(day, type)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
