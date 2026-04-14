import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Button, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  Popover, useMediaQuery, useTheme, TextField,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { format, startOfWeek, addDays } from 'date-fns';
import { Profile, ParsedConstraint, DAY_KEYS, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

type SlotState = 'available' | 'prefer_not' | 'cannot_work';

const SLOT_COLORS: Record<SlotState, 'success' | 'warning' | 'error'> = {
  available: 'success',
  prefer_not: 'warning',
  cannot_work: 'error',
};
const SLOT_LABELS: Record<SlotState, string> = {
  available: 'פנוי',
  prefer_not: 'עדיף לא',
  cannot_work: 'לא יכול',
};

function parsedToGrid(parsed: ParsedConstraint): Record<string, SlotState> {
  const grid: Record<string, SlotState> = {};
  for (const key of parsed.cannot_work) grid[key] = 'cannot_work';
  for (const key of parsed.prefer_not) grid[key] = 'prefer_not';
  return grid;
}

function gridToParsed(grid: Record<string, SlotState>): ParsedConstraint {
  const cannot_work: string[] = [];
  const prefer_not: string[] = [];
  for (const [key, state] of Object.entries(grid)) {
    if (state === 'cannot_work') cannot_work.push(key);
    if (state === 'prefer_not') prefer_not.push(key);
  }
  return { cannot_work, prefer_not, prefer: [], notes: '' };
}

function getWeekOptions(): { label: string; value: string }[] {
  const options = [];
  for (let i = 0; i <= 4; i++) {
    const d = startOfWeek(addDays(new Date(), i * 7), { weekStartsOn: 0 });
    const val = format(d, 'yyyy-MM-dd');
    const label = i === 0 ? `שבוע זה (${val})` : i === 1 ? `שבוע הבא (${val})` : val;
    options.push({ label, value: val });
  }
  return options;
}

interface Props { profile: Profile; }

export default function ConstraintEditor({ profile }: Props) {
  const weekOptions = getWeekOptions();
  const [weekStart, setWeekStart] = useState(weekOptions[1].value); // next week default
  const [grid, setGrid] = useState<Record<string, SlotState>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const shifts: ShiftType[] = ['morning', 'evening'];

  useEffect(() => {
    setGrid({});
    setNotes('');
    setSuccess(false);
    supabase.from('constraints')
      .select('parsed_json')
      .eq('employee_id', profile.id)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.parsed_json) {
          setGrid(parsedToGrid(data.parsed_json as ParsedConstraint));
          setNotes((data.parsed_json as ParsedConstraint).notes ?? '');
        }
      });
  }, [profile.id, weekStart]);

  function openPicker(event: React.MouseEvent<HTMLElement>, slotKey: string) {
    setAnchorEl(event.currentTarget);
    setActiveSlot(slotKey);
  }

  function selectState(state: SlotState) {
    if (!activeSlot) return;
    setGrid(prev => {
      const updated = { ...prev };
      if (state === 'available') delete updated[activeSlot];
      else updated[activeSlot] = state;
      return updated;
    });
    setAnchorEl(null);
    setActiveSlot(null);
    setSuccess(false);
  }

  async function handleSubmit() {
    setSaving(true);
    await supabase.from('constraints').upsert({
      employee_id: profile.id,
      week_start: weekStart,
      raw_text: '',
      parsed_json: { ...gridToParsed(grid), notes },
      status: 'approved',
    }, { onConflict: 'employee_id,week_start' });
    setSaving(false);
    setSuccess(true);
  }

  function renderSlotCell(slotKey: string) {
    const state: SlotState = grid[slotKey] ?? 'available';
    return (
      <TableCell key={slotKey} align="center" sx={{ p: 0.75 }}>
        <Chip
          label={SLOT_LABELS[state]}
          color={SLOT_COLORS[state]}
          onClick={(e) => openPicker(e, slotKey)}
          sx={{ cursor: 'pointer', minWidth: 76 }}
        />
      </TableCell>
    );
  }

  return (
    <Box maxWidth={680} mx="auto">
      <Box display="flex" alignItems="center" gap={2} mb={2} flexWrap="wrap">
        <Typography variant="h6">הגשת משמרות</Typography>
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel>שבוע</InputLabel>
          <Select value={weekStart} label="שבוע" onChange={e => setWeekStart(e.target.value)}>
            {weekOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Paper variant="outlined" sx={{ mb: 2, overflowX: 'auto' }}>
        {isMobile ? (
          /* Mobile: days as rows, morning/evening as columns */
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} />
                {shifts.map(t => (
                  <TableCell key={t} align="center" sx={{ color: 'white', fontWeight: 700 }}>
                    {SHIFT_LABELS[t]}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {DAY_NAMES.map((dayName, i) => (
                <TableRow key={dayName}>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{dayName}</TableCell>
                  {shifts.map(t => renderSlotCell(`${DAY_KEYS[i]}_${t}`))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          /* Desktop: days as columns, morning/evening as rows */
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 700, width: 60 }} />
                {DAY_NAMES.map(d => (
                  <TableCell key={d} align="center" sx={{ color: 'white', fontWeight: 700 }}>{d}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map(type => (
                <TableRow key={type}>
                  <TableCell sx={{ fontWeight: 600 }}>{SHIFT_LABELS[type]}</TableCell>
                  {DAY_KEYS.map(dayKey => renderSlotCell(`${dayKey}_${type}`))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* State picker popover */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box p={1} display="flex" flexDirection="column" gap={0.75}>
          {(['available', 'prefer_not', 'cannot_work'] as SlotState[]).map(s => (
            <Chip
              key={s}
              label={SLOT_LABELS[s]}
              color={SLOT_COLORS[s]}
              onClick={() => selectState(s)}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Popover>

      <TextField
        fullWidth
        multiline
        rows={2}
        label="הערות נוספות (אופציונלי)"
        placeholder="למשל: בשבוע זה יש לי אירוע משפחתי ביום רביעי..."
        value={notes}
        onChange={e => { setNotes(e.target.value); setSuccess(false); }}
        sx={{ mb: 2 }}
      />

      <Button variant="contained" color="success" onClick={handleSubmit} disabled={saving}>
        {saving ? <CircularProgress size={20} color="inherit" /> : 'שמור'}
      </Button>
      {success && <Alert severity="success" sx={{ mt: 2 }}>האילוצים נשמרו בהצלחה</Alert>}
    </Box>
  );
}
