import { useState } from 'react';
import {
  Box, TextField, Button, Typography, Paper, Chip, CircularProgress, Alert
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { Profile, ParsedConstraint, DAY_KEYS, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

type SlotState = 'available' | 'prefer_not' | 'cannot_work';

const SLOT_COLORS: Record<SlotState, 'success' | 'warning' | 'error'> = {
  available: 'success', prefer_not: 'warning', cannot_work: 'error',
};
const SLOT_LABELS: Record<SlotState, string> = {
  available: 'פנוי', prefer_not: 'עדיף לא', cannot_work: 'לא יכול',
};
const CYCLE: SlotState[] = ['available', 'prefer_not', 'cannot_work'];

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

function getWeekStart(): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  return sunday.toISOString().split('T')[0];
}

interface Props { profile: Profile; }

export default function ConstraintEditor({ profile }: Props) {
  const [text, setText] = useState('');
  const [grid, setGrid] = useState<Record<string, SlotState> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState('');
  const [success, setSuccess] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL as string;
  const shifts: ShiftType[] = ['morning', 'evening'];

  async function handleParse() {
    setParsing(true); setParseError(''); setSuccess(false);
    try {
      const res = await fetch(`${apiUrl}/api/constraints/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const parsed: ParsedConstraint = await res.json();
      setGrid(parsedToGrid(parsed));
    } catch {
      setParseError('לא הצלחנו לפרש, אנא נסח מחדש');
    }
    setParsing(false);
  }

  function cycleSlot(key: string) {
    setGrid(prev => {
      const current: SlotState = prev?.[key] ?? 'available';
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
      const updated = { ...prev };
      if (next === 'available') delete updated[key];
      else updated[key] = next;
      return updated;
    });
  }

  async function handleSubmit() {
    if (!grid) return;
    setSaving(true);
    await supabase.from('constraints').upsert({
      employee_id: profile.id,
      week_start: getWeekStart(),
      raw_text: text,
      parsed_json: gridToParsed(grid),
      status: 'pending',
    }, { onConflict: 'employee_id,week_start' });
    setSaving(false);
    setSuccess(true);
  }

  return (
    <Box maxWidth={700} mx="auto">
      <Typography variant="h6" mb={2}>הגשת אילוצים לשבוע הבא</Typography>
      <TextField
        fullWidth multiline rows={3}
        label="תאר את האילוצים שלך בחופשיות"
        placeholder="למשל: אני לא יכול ביום ראשון בבוקר, ועדיף שלא ביום שני"
        value={text} onChange={e => setText(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Button variant="contained" onClick={handleParse} disabled={parsing || !text.trim()} sx={{ mb: 2 }}>
        {parsing ? <CircularProgress size={20} color="inherit" /> : 'פרש עם AI'}
      </Button>
      {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}
      {grid !== null && (
        <>
          <Typography variant="body2" color="text.secondary" mb={1}>
            לחץ על כל תא כדי לשנות: פנוי ← לא יכול ← עדיף לא
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box display="grid" gridTemplateColumns="80px repeat(6, 1fr)" gap={1}>
              <Box />
              {DAY_NAMES.map(d => (
                <Typography key={d} variant="caption" textAlign="center" fontWeight={700}>{d}</Typography>
              ))}
              {shifts.map(type => (
                <>
                  <Typography key={`label-${type}`} variant="caption" display="flex" alignItems="center" fontWeight={500}>
                    {SHIFT_LABELS[type]}
                  </Typography>
                  {DAY_KEYS.map((dayKey) => {
                    const slotKey = `${dayKey}_${type}`;
                    const state: SlotState = grid[slotKey] ?? 'available';
                    return (
                      <Chip
                        key={slotKey}
                        label={SLOT_LABELS[state]}
                        color={SLOT_COLORS[state]}
                        size="small"
                        onClick={() => cycleSlot(slotKey)}
                        sx={{ cursor: 'pointer', fontSize: 11 }}
                      />
                    );
                  })}
                </>
              ))}
            </Box>
          </Paper>
          <Button variant="contained" color="success" onClick={handleSubmit} disabled={saving}>
            {saving ? <CircularProgress size={20} color="inherit" /> : 'שמור אילוצים'}
          </Button>
          {success && <Alert severity="success" sx={{ mt: 2 }}>האילוצים נשמרו בהצלחה</Alert>}
        </>
      )}
    </Box>
  );
}
