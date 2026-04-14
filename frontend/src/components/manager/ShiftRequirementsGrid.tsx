import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Alert, TextField,
  Table, TableHead, TableBody, TableRow, TableCell, Paper,
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { ShiftRequirement, DAY_NAMES, ShiftType, SHIFT_LABELS } from '../../types';

type GridCell = { waiters: number; cooks: number; reqId: string | null };
type Grid = Record<string, GridCell>;
const SHIFTS: ShiftType[] = ['morning', 'evening'];

export default function ShiftRequirementsGrid() {
  const [grid, setGrid] = useState<Grid>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('shift_requirements').select('*').is('target_date', null)
      .then(({ data }) => {
        const g: Grid = {};
        (data as ShiftRequirement[] ?? []).forEach(r => {
          g[`${r.day_of_week}_${r.shift_type}`] = {
            waiters: r.required_waiters, cooks: r.required_cooks, reqId: r.id,
          };
        });
        setGrid(g);
      });
  }, []);

  function update(day: number, type: ShiftType, field: 'waiters' | 'cooks', value: string) {
    const key = `${day}_${type}`;
    setGrid(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? { waiters: 2, cooks: 3, reqId: null }), [field]: parseInt(value) || 0 },
    }));
  }

  async function save() {
    setSaving(true);
    for (let day = 0; day <= 5; day++) {
      for (const type of SHIFTS) {
        const key = `${day}_${type}`;
        const cell = grid[key] ?? { waiters: 2, cooks: 3, reqId: null };
        await supabase.from('shift_requirements').upsert({
          ...(cell.reqId ? { id: cell.reqId } : {}),
          day_of_week: day, shift_type: type,
          required_waiters: cell.waiters, required_cooks: cell.cooks,
          target_date: null,
        }, { onConflict: 'day_of_week,shift_type,target_date' });
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Box maxWidth={500} mx="auto">
      <Typography variant="h6" mb={2}>דרישות משמרת ברירת מחדל</Typography>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>יום</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>משמרת</TableCell>
              <TableCell align="center" sx={{ color: 'white', fontWeight: 700 }}>מלצרים</TableCell>
              <TableCell align="center" sx={{ color: 'white', fontWeight: 700 }}>טבחים</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 6 }, (_, day) => (
              SHIFTS.map((type, shiftIdx) => {
                const cell = grid[`${day}_${type}`] ?? { waiters: 2, cooks: 3, reqId: null };
                return (
                  <TableRow
                    key={`${day}_${type}`}
                    sx={{ bgcolor: shiftIdx === 0 ? 'grey.50' : 'white' }}
                  >
                    {shiftIdx === 0 && (
                      <TableCell
                        rowSpan={2}
                        sx={{ fontWeight: 700, verticalAlign: 'middle', borderLeft: '3px solid', borderColor: 'primary.main' }}
                      >
                        {DAY_NAMES[day]}
                      </TableCell>
                    )}
                    <TableCell sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      {SHIFT_LABELS[type]}
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0.75 }}>
                      <TextField
                        size="small" type="number" value={cell.waiters}
                        onChange={e => update(day, type, 'waiters', e.target.value)}
                        inputProps={{ min: 0, style: { textAlign: 'center', width: 44 } }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0.75 }}>
                      <TextField
                        size="small" type="number" value={cell.cooks}
                        onChange={e => update(day, type, 'cooks', e.target.value)}
                        inputProps={{ min: 0, style: { textAlign: 'center', width: 44 } }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Box mt={2} display="flex" gap={2} alignItems="center">
        <Button variant="contained" onClick={save} disabled={saving}>שמור דרישות</Button>
        {saved && <Alert severity="success" sx={{ py: 0 }}>נשמר</Alert>}
      </Box>
    </Box>
  );
}
