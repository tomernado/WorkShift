import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, CircularProgress, Alert, Select, MenuItem,
  FormControl, InputLabel, useMediaQuery, useTheme,
} from '@mui/material';
import { format, startOfWeek, addDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Profile, ParsedConstraint, DAY_KEYS, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

interface ConstraintRow {
  employee_id: string;
  parsed_json: ParsedConstraint | null;
}

const SHIFTS: ShiftType[] = ['morning', 'evening'];

const HEADER_SX = {
  bgcolor: 'primary.main',
  color: 'white',
  fontWeight: 700,
};

function getWeekOptions(): { label: string; value: string }[] {
  const options = [];
  for (let i = -1; i <= 3; i++) {
    const d = startOfWeek(addDays(new Date(), i * 7), { weekStartsOn: 0 });
    const val = format(d, 'yyyy-MM-dd');
    const label = i === 0 ? `שבוע זה (${val})` : i === 1 ? `שבוע הבא (${val})` : val;
    options.push({ label, value: val });
  }
  return options;
}

function slotState(parsed: ParsedConstraint | null, day: string, shift: ShiftType): 'cannot_work' | 'prefer_not' | 'available' {
  if (!parsed) return 'available';
  const key = `${day}_${shift}`;
  if (parsed.cannot_work?.includes(key)) return 'cannot_work';
  if (parsed.prefer_not?.includes(key)) return 'prefer_not';
  return 'available';
}

const STATE_COLORS = { cannot_work: 'error' as const, prefer_not: 'warning' as const, available: 'success' as const };
const STATE_LABELS = { cannot_work: 'לא יכול', prefer_not: 'עדיף לא', available: 'פנוי' };

export default function ConstraintsOverview() {
  const weekOptions = getWeekOptions();
  const [weekStart, setWeekStart] = useState(weekOptions[1].value);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [constraints, setConstraints] = useState<Record<string, ParsedConstraint | null>>({});
  const [loading, setLoading] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    supabase.from('profiles').select('id,name,job_role,is_active')
      .eq('is_active', true).neq('role', 'manager').order('name')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => {
    if (employees.length === 0) return;
    setLoading(true);
    supabase.from('constraints').select('employee_id,parsed_json').eq('week_start', weekStart)
      .then(({ data }) => {
        const map: Record<string, ParsedConstraint | null> = {};
        employees.forEach(e => { map[e.id] = null; });
        (data as ConstraintRow[] ?? []).forEach(r => { map[r.employee_id] = r.parsed_json; });
        setConstraints(map);
        setLoading(false);
      });
  }, [weekStart, employees]);

  const submitted = employees.filter(e => constraints[e.id] !== null && constraints[e.id] !== undefined);
  const notSubmitted = employees.filter(e => constraints[e.id] === null || constraints[e.id] === undefined);

  const header = (
    <Box display="flex" alignItems="center" gap={2} mb={2.5} flexWrap="wrap">
      <Typography variant="h6" fontWeight={700} color="text.primary">אילוצי עובדים</Typography>
      <FormControl size="small" sx={{ minWidth: 210 }}>
        <InputLabel>שבוע</InputLabel>
        <Select value={weekStart} label="שבוע" onChange={e => setWeekStart(e.target.value)}>
          {weekOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </Select>
      </FormControl>
      <Chip
        label={`הגישו: ${submitted.length}/${employees.length}`}
        color={submitted.length === employees.length ? 'success' : 'warning'}
        sx={{ fontWeight: 600 }}
      />
    </Box>
  );

  if (loading) return <>{header}<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} /></>;

  /* ── Mobile: cards ── */
  if (isMobile) {
    return (
      <Box>
        {header}
        {employees.map(emp => {
          const parsed = constraints[emp.id];
          const hasConstraint = parsed !== null && parsed !== undefined;
          const hasAnyConstraint = hasConstraint && (
            (parsed?.cannot_work?.length ?? 0) > 0 || (parsed?.prefer_not?.length ?? 0) > 0
          );
          return (
            <Paper
              key={emp.id}
              elevation={2}
              sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}
            >
              {/* Card header */}
              <Box sx={{
                ...HEADER_SX,
                px: 2, py: 1.25,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <Typography fontWeight={700} fontSize={15}>{emp.name}</Typography>
                <Chip
                  size="small"
                  label={hasConstraint ? 'הגיש' : 'טרם הגיש'}
                  sx={{
                    bgcolor: hasConstraint ? '#43a047' : 'rgba(255,255,255,0.25)',
                    color: 'white', fontWeight: 600, fontSize: 11,
                  }}
                />
              </Box>

              {hasConstraint && (
                <Box>
                  {/* Constraints table — only rows with actual constraints */}
                  {hasAnyConstraint && (
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 12 }}>יום</TableCell>
                          {SHIFTS.map(t => (
                            <TableCell key={t} align="center" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 12 }}>
                              {SHIFT_LABELS[t]}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {DAY_NAMES.map((name, i) => {
                          const ms = slotState(parsed, DAY_KEYS[i], 'morning');
                          const es = slotState(parsed, DAY_KEYS[i], 'evening');
                          if (ms === 'available' && es === 'available') return null;
                          return (
                            <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                              <TableCell sx={{ fontWeight: 600 }}>{name}</TableCell>
                              {SHIFTS.map(t => {
                                const s = slotState(parsed, DAY_KEYS[i], t);
                                return (
                                  <TableCell key={t} align="center" sx={{ p: 0.75 }}>
                                    {s !== 'available'
                                      ? <Chip label={STATE_LABELS[s]} color={STATE_COLORS[s]} size="small" />
                                      : <Typography variant="caption" color="success.main" fontWeight={600}>✓</Typography>
                                    }
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {/* Notes */}
                  {parsed?.notes && (
                    <Box sx={{ px: 2, py: 1.25, bgcolor: '#fffde7', borderTop: '1px solid #f5f5f5' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>הערות: </Typography>
                      <Typography variant="caption" color="text.primary">{parsed.notes}</Typography>
                    </Box>
                  )}

                  {!hasAnyConstraint && !parsed?.notes && (
                    <Box px={2} py={1}>
                      <Typography variant="caption" color="success.main" fontWeight={600}>✓ פנוי לכל המשמרות</Typography>
                    </Box>
                  )}
                  {!hasAnyConstraint && parsed?.notes && (
                    <Box px={2} pb={1}>
                      <Typography variant="caption" color="success.main" fontWeight={600}>✓ פנוי לכל המשמרות</Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          );
        })}
      </Box>
    );
  }

  /* ── Desktop: full table ── */
  return (
    <Box>
      {header}
      {notSubmitted.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          טרם הגישו: {notSubmitted.map(e => e.name).join(', ')}
        </Alert>
      )}
      <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...HEADER_SX, minWidth: 110 }}>עובד</TableCell>
              <TableCell sx={{ ...HEADER_SX, width: 80 }}>סטטוס</TableCell>
              <TableCell sx={{ ...HEADER_SX, minWidth: 160 }}>הערות</TableCell>
              {DAY_NAMES.map((d, i) => (
                SHIFTS.map(t => (
                  <TableCell key={`${i}_${t}`} align="center" sx={{ ...HEADER_SX, fontSize: 11, p: '6px 4px', lineHeight: 1.4 }}>
                    {d}<br />{SHIFT_LABELS[t]}
                  </TableCell>
                ))
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((emp, rowIdx) => {
              const parsed = constraints[emp.id];
              const hasConstraint = parsed !== null && parsed !== undefined;
              return (
                <TableRow
                  key={emp.id}
                  hover
                  sx={{ bgcolor: rowIdx % 2 === 0 ? 'white' : '#fafafa' }}
                >
                  <TableCell sx={{ fontWeight: 700 }}>{emp.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={hasConstraint ? 'הגיש' : 'טרם הגיש'}
                      color={hasConstraint ? 'success' : 'default'}
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: parsed?.notes ? 'text.primary' : 'text.disabled', maxWidth: 200 }}>
                    {parsed?.notes || '—'}
                  </TableCell>
                  {DAY_NAMES.map((_, i) => (
                    SHIFTS.map(t => {
                      const s = slotState(parsed, DAY_KEYS[i], t);
                      return (
                        <TableCell key={`${i}_${t}`} align="center" sx={{ p: '4px 2px' }}>
                          {s !== 'available'
                            ? <Chip label={STATE_LABELS[s]} color={STATE_COLORS[s]} size="small" sx={{ fontSize: 10 }} />
                            : <Typography variant="caption" color="success.main" fontWeight={700}>✓</Typography>
                          }
                        </TableCell>
                      );
                    })
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
