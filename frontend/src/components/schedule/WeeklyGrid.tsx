import {
  Paper, Typography, Chip, Box,
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

  function renderCell(day: number, type: ShiftType) {
    const dayShifts = getShifts(day, type);
    if (dayShifts.length === 0)
      return <Typography variant="caption" color="text.disabled">—</Typography>;

    const waiters = dayShifts.filter(s => s.employee_id && empMap[s.employee_id]?.job_role === 'waiter');
    const cooks   = dayShifts.filter(s => s.employee_id && empMap[s.employee_id]?.job_role === 'cook');
    const others  = dayShifts.filter(s => !waiters.includes(s) && !cooks.includes(s));
    const shiftNote = dayShifts[0]?.shift_note;
    const myShift = dayShifts.find(s => s.employee_id === currentEmployeeId);

    function renderChip(s: ScheduleShift) {
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
    }

    return (
      <Box>
        {waiters.length > 0 && (
          <Box mb={0.25}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, lineHeight: 1 }}>מלצרים</Typography>
            <Box display="flex" flexWrap="wrap">{waiters.map(renderChip)}</Box>
          </Box>
        )}
        {cooks.length > 0 && (
          <Box mb={0.25}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, lineHeight: 1 }}>טבחים</Typography>
            <Box display="flex" flexWrap="wrap">{cooks.map(renderChip)}</Box>
          </Box>
        )}
        {others.map(renderChip)}
        {shiftNote && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9, mt: 0.25, fontStyle: 'italic' }}>
            📝 {shiftNote}
          </Typography>
        )}
        {myShift?.employee_note && (
          <Typography variant="caption" color="primary" display="block" sx={{ fontSize: 9, mt: 0.25 }}>
            💬 {myShift.employee_note}
          </Typography>
        )}
      </Box>
    );
  }

  if (isMobile) {
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
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{name}</TableCell>
                {SHIFT_TYPES.map(type => (
                  <TableCell key={type} sx={{ p: 0.75, verticalAlign: 'top' }}>
                    {renderCell(day, type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  }

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
                  {renderCell(day, type)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
