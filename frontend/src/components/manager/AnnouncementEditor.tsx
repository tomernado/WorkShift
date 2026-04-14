import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { format, startOfWeek, addDays } from 'date-fns';
import { supabase } from '../../lib/supabase';

function getWeekOptions(): { label: string; value: string }[] {
  const options = [];
  for (let i = -1; i <= 4; i++) {
    const d = startOfWeek(addDays(new Date(), i * 7), { weekStartsOn: 0 });
    const val = format(d, 'yyyy-MM-dd');
    const label = i === 0 ? `שבוע זה (${val})` : i === 1 ? `שבוע הבא (${val})` : val;
    options.push({ label, value: val });
  }
  return options;
}

export default function AnnouncementEditor() {
  const weekOptions = getWeekOptions();
  const [weekStart, setWeekStart] = useState(weekOptions[1].value);
  const [text, setText] = useState('');
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSaved(false);
    supabase.from('schedules').select('id,announcement')
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        setScheduleId(data?.id ?? null);
        setText(data?.announcement ?? '');
        setLoading(false);
      });
  }, [weekStart]);

  async function save() {
    if (!scheduleId) return;
    await supabase.from('schedules').update({ announcement: text }).eq('id', scheduleId);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <Box maxWidth={600} mx="auto">
      <Typography variant="h6" mb={2}>הודעה כללית לעובדים</Typography>

      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>שבוע</InputLabel>
          <Select value={weekStart} label="שבוע" onChange={e => setWeekStart(e.target.value)}>
            {weekOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {loading && <CircularProgress size={24} sx={{ display: 'block', my: 3 }} />}

      {!loading && !scheduleId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          אין לוח משמרות לשבוע זה. צור לוח קודם מ"לוח משמרות".
        </Alert>
      )}

      {!loading && scheduleId && (
        <>
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={10}
            label="הודעה לעובדים"
            placeholder="לדוגמה: שבוע טוב לכולם! יש אירוע ביום שישי — נא להגיע 15 דקות מוקדם"
            value={text}
            onChange={e => setText(e.target.value)}
            inputProps={{ maxLength: 1000 }}
            helperText={`${text.length}/1000`}
          />

          <Box display="flex" alignItems="center" gap={2} mt={2}>
            <Button variant="contained" onClick={save}>שמור הודעה</Button>
            {text && (
              <Button variant="outlined" color="error" onClick={() => setText('')}>
                מחק הודעה
              </Button>
            )}
            {saved && <Typography color="success.main" fontWeight={600}>✓ נשמר</Typography>}
          </Box>

          {text && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="caption" fontWeight={700}>תצוגה מקדימה אצל העובדים:</Typography>
              <Typography variant="body2" mt={0.5}>{text}</Typography>
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
