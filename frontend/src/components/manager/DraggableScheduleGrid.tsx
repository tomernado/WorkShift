import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Box, Paper, Typography, Button, Chip, Tooltip, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell,
  useMediaQuery, useTheme,
} from '@mui/material';
import { format, startOfWeek, addDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Profile, ScheduleShift, Schedule, ParsedConstraint, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';
import ShiftSlotPanel from './ShiftSlotPanel';

const apiUrl = import.meta.env.VITE_API_URL as string;
const SHIFTS: ShiftType[] = ['morning', 'evening'];

function getWeekStart(offset = 0): string {
  const d = startOfWeek(addDays(new Date(), offset * 7), { weekStartsOn: 0 });
  return format(d, 'yyyy-MM-dd');
}

interface PanelTarget { day: number; shiftType: ShiftType; }

export default function DraggableScheduleGrid() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [constraints, setConstraints] = useState<Record<string, ParsedConstraint | null>>({});
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');
  const [panel, setPanel] = useState<PanelTarget | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const weekStart = getWeekStart(weekOffset);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const isDraft = schedule?.status === 'draft';

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_active', true).neq('role', 'manager')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => { loadSchedule(); }, [weekStart]);

  // Load constraints for current week so ShiftSlotPanel can show them
  useEffect(() => {
    if (employees.length === 0) return;
    supabase.from('constraints')
      .select('employee_id,parsed_json')
      .eq('week_start', weekStart)
      .then(({ data }) => {
        const map: Record<string, ParsedConstraint | null> = {};
        employees.forEach(e => { map[e.id] = null; });
        (data ?? []).forEach((r: { employee_id: string; parsed_json: ParsedConstraint | null }) => {
          map[r.employee_id] = r.parsed_json;
        });
        setConstraints(map);
      });
  }, [weekStart, employees]);

  async function loadSchedule() {
    setSchedule(null); setShifts([]);
    const { data } = await supabase.from('schedules').select('*')
      .eq('week_start', weekStart).maybeSingle();
    if (data) {
      setSchedule(data);
      const { data: s } = await supabase.from('schedule_shifts').select('*').eq('schedule_id', data.id);
      setShifts(s ?? []);
    }
  }

  async function generate() {
    setGenerating(true); setMsg('');
    try {
      const res = await fetch(`${apiUrl}/api/schedule/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const data = await res.json();
      setMsg(`נוצר לוח — ${data.conflict_count} קונפליקטים`);
      await loadSchedule();
    } catch {
      setMsg('שגיאה ביצירת הלוח');
    }
    setGenerating(false);
  }

  async function publish() {
    if (!schedule) return;
    setPublishing(true);
    try {
      await fetch(`${apiUrl}/api/schedule/${schedule.id}/publish`, { method: 'POST' });
      await loadSchedule();
    } catch {
      setMsg('שגיאה בפרסום');
    }
    setPublishing(false);
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.droppableId === result.source.droppableId) return;
    const shiftId = result.draggableId;
    const [dayStr, targetShiftType] = result.destination.droppableId.split('__');
    const targetDay = parseInt(dayStr, 10);

    setShifts(prev => prev.map(s =>
      s.id === shiftId
        ? { ...s, day_of_week: targetDay, shift_type: targetShiftType as ShiftType, is_conflict: false, conflict_reason: null }
        : s
    ));

    await fetch(`${apiUrl}/api/schedule/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOfWeek: targetDay, shiftType: targetShiftType }),
    });
  }

  function getCellShifts(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  function renderCell(day: number, type: ShiftType) {
    const cellShifts = getCellShifts(day, type);
    const hasConflict = cellShifts.some(s => s.is_conflict);
    const shiftNote = cellShifts[0]?.shift_note;
    const dropId = `${day}__${type}`;

    const waiters = cellShifts.filter(s => s.employee_id && empMap[s.employee_id]?.job_role === 'waiter');
    const cooks   = cellShifts.filter(s => s.employee_id && empMap[s.employee_id]?.job_role === 'cook');

    function renderChip(s: ScheduleShift, idx: number) {
      const emp = s.employee_id ? empMap[s.employee_id] : null;
      return (
        <Draggable key={s.id} draggableId={s.id} index={idx} isDragDisabled={!isDraft}>
          {(drag) => (
            <Tooltip title={s.conflict_reason ?? (s.employee_note ? `הערה: ${s.employee_note}` : '')}
              disableHoverListener={!s.is_conflict && !s.employee_note}>
              <Chip
                ref={drag.innerRef}
                {...drag.draggableProps}
                {...drag.dragHandleProps}
                label={emp?.name ?? '⚠ חסר'}
                size="small"
                color={s.is_conflict ? 'warning' : 'default'}
                sx={{ m: 0.2, cursor: isDraft ? 'grab' : 'default', fontSize: 11, maxWidth: 90 }}
              />
            </Tooltip>
          )}
        </Draggable>
      );
    }

    return (
      <Droppable droppableId={dropId} key={dropId}>
        {(provided) => (
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            onClick={isDraft ? () => setPanel({ day, shiftType: type }) : undefined}
            sx={{
              minHeight: 52,
              p: 0.5,
              borderRadius: 1,
              bgcolor: hasConflict ? '#fff8e1' : 'grey.50',
              border: '1px solid',
              borderColor: hasConflict ? 'warning.main' : 'divider',
              cursor: isDraft ? 'pointer' : 'default',
              '&:hover': isDraft ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : {},
            }}
          >
            {/* Waiter group */}
            {waiters.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, lineHeight: 1 }}>מלצרים</Typography>
                <Box display="flex" flexWrap="wrap">{waiters.map((s, i) => renderChip(s, i))}</Box>
              </Box>
            )}
            {/* Cook group */}
            {cooks.length > 0 && (
              <Box mt={waiters.length > 0 ? 0.5 : 0}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, lineHeight: 1 }}>טבחים</Typography>
                <Box display="flex" flexWrap="wrap">{cooks.map((s, i) => renderChip(s, waiters.length + i))}</Box>
              </Box>
            )}
            {/* Untyped employees */}
            {cellShifts.filter(s => !waiters.includes(s) && !cooks.includes(s)).map((s, i) =>
              renderChip(s, waiters.length + cooks.length + i)
            )}
            {/* Shift note indicator */}
            {shiftNote && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 9, mt: 0.25, fontStyle: 'italic' }}>
                📝 {shiftNote.slice(0, 30)}{shiftNote.length > 30 ? '…' : ''}
              </Typography>
            )}
            {provided.placeholder}
          </Box>
        )}
      </Droppable>
    );
  }

  const panelShifts = panel ? getCellShifts(panel.day, panel.shiftType) : [];

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
        <Button size="small" variant="outlined" onClick={() => setWeekOffset(w => w - 1)}>◄</Button>
        <Typography fontWeight={700} minWidth={100} textAlign="center">{weekStart}</Typography>
        <Button size="small" variant="outlined" onClick={() => setWeekOffset(w => w + 1)}>►</Button>

        <Button variant="contained" size="small" onClick={generate} disabled={generating} sx={{ ml: 1 }}>
          {generating ? <CircularProgress size={16} color="inherit" /> : 'ייצר לוח'}
        </Button>

        {isDraft && (
          <Button variant="contained" color="success" size="small" onClick={publish} disabled={publishing}>
            {publishing ? <CircularProgress size={16} color="inherit" /> : 'פרסם'}
          </Button>
        )}

        {schedule && (
          <Chip
            label={schedule.status === 'published' ? 'מפורסם' : 'טיוטה'}
            color={schedule.status === 'published' ? 'success' : 'warning'}
            size="small"
          />
        )}
      </Box>

      {msg && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}

      {isDraft && (
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          לחץ על תא לעריכה · גרור chip להזזת משמרת
        </Typography>
      )}

      {!schedule && !generating && (
        <Typography color="text.secondary" textAlign="center" mt={4}>
          לחץ על "ייצר לוח" כדי להתחיל
        </Typography>
      )}

      {schedule && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            {isMobile ? (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>יום</TableCell>
                    {SHIFTS.map(t => (
                      <TableCell key={t} align="center" sx={{ color: 'white', fontWeight: 700 }}>
                        {SHIFT_LABELS[t]}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {DAY_NAMES.map((name, day) => (
                    <TableRow key={day}>
                      <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top', pt: 1 }}>
                        {name}
                      </TableCell>
                      {SHIFTS.map(type => (
                        <TableCell key={type} sx={{ p: 0.75, verticalAlign: 'top' }}>
                          {renderCell(day, type)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
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
                  {SHIFTS.map(type => (
                    <TableRow key={type}>
                      <TableCell sx={{ fontWeight: 600 }}>{SHIFT_LABELS[type]}</TableCell>
                      {Array.from({ length: 6 }, (_, day) => (
                        <TableCell key={day} sx={{ p: 0.75, minWidth: 110, verticalAlign: 'top' }}>
                          {renderCell(day, type)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </DragDropContext>
      )}

      {panel && schedule && (
        <ShiftSlotPanel
          open={!!panel}
          scheduleId={schedule.id}
          day={panel.day}
          shiftType={panel.shiftType}
          shifts={panelShifts}
          employees={employees}
          constraints={constraints}
          onClose={() => setPanel(null)}
          onSaved={() => { setPanel(null); loadSchedule(); }}
        />
      )}
    </Box>
  );
}
