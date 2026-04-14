import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Box, Paper, Typography, Button, Chip, Tooltip, Alert, CircularProgress
} from '@mui/material';
import { format, startOfWeek, addDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Profile, ScheduleShift, Schedule, DAY_NAMES, SHIFT_LABELS, ShiftType } from '../../types';

const apiUrl = import.meta.env.VITE_API_URL as string;
const SHIFTS: ShiftType[] = ['morning', 'evening'];

function getWeekStart(offset = 0): string {
  const d = startOfWeek(addDays(new Date(), offset * 7), { weekStartsOn: 0 });
  return format(d, 'yyyy-MM-dd');
}

export default function DraggableScheduleGrid() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');

  const weekStart = getWeekStart(weekOffset);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  useEffect(() => {
    supabase.from('profiles').select('*').eq('is_active', true).neq('role', 'manager')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => { loadSchedule(); }, [weekStart]);

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
    const shiftId = result.draggableId;
    const destParts = result.destination.droppableId.split('__');
    const targetEmpId = destParts[2];

    setShifts(prev => prev.map(s =>
      s.id === shiftId
        ? { ...s, employee_id: targetEmpId, is_conflict: false, conflict_reason: null }
        : s
    ));

    await fetch(`${apiUrl}/api/schedule/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: targetEmpId }),
    });
  }

  function getCellShifts(day: number, type: ShiftType) {
    return shifts.filter(s => s.day_of_week === day && s.shift_type === type);
  }

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
        <Button size="small" onClick={() => setWeekOffset(w => w - 1)}>◄</Button>
        <Typography fontWeight={700} minWidth={100} textAlign="center">{weekStart}</Typography>
        <Button size="small" onClick={() => setWeekOffset(w => w + 1)}>►</Button>

        <Button variant="contained" size="small" onClick={generate} disabled={generating} sx={{ ml: 1 }}>
          {generating ? <CircularProgress size={16} color="inherit" /> : 'ייצר לוח'}
        </Button>

        {schedule?.status === 'draft' && (
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

      {!schedule && !generating && (
        <Typography color="text.secondary" textAlign="center" mt={4}>
          לחץ על "ייצר לוח" כדי להתחיל
        </Typography>
      )}

      {schedule && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box display="grid" gridTemplateColumns="90px repeat(6, 1fr)" gap={0.5} minWidth={750}>
              {/* Header row */}
              <Box />
              {DAY_NAMES.map(d => (
                <Paper key={d} sx={{ p: 0.75, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
                  <Typography variant="caption" fontWeight={700}>{d}</Typography>
                </Paper>
              ))}

              {SHIFTS.map(type => (
                <>
                  <Paper key={`label-${type}`} sx={{ p: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="caption" fontWeight={500}>{SHIFT_LABELS[type]}</Typography>
                  </Paper>

                  {Array.from({ length: 6 }, (_, day) => {
                    const cellShifts = getCellShifts(day, type);
                    const hasConflict = cellShifts.some(s => s.is_conflict);
                    const dropId = `${day}__${type}__drop`;

                    return (
                      <Droppable droppableId={dropId} key={`${type}-${day}`}>
                        {(provided) => (
                          <Paper
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            variant="outlined"
                            sx={{
                              p: 0.5, minHeight: 70,
                              bgcolor: hasConflict ? '#fff8e1' : 'white',
                              borderColor: hasConflict ? 'warning.main' : 'divider',
                            }}
                          >
                            {cellShifts.map((s, idx) => {
                              const emp = s.employee_id ? empMap[s.employee_id] : null;
                              return (
                                <Draggable
                                  key={s.id}
                                  draggableId={s.id}
                                  index={idx}
                                  isDragDisabled={schedule.status === 'published'}
                                >
                                  {(drag) => (
                                    <Tooltip
                                      title={s.conflict_reason ?? ''}
                                      disableHoverListener={!s.is_conflict}
                                    >
                                      <Chip
                                        ref={drag.innerRef}
                                        {...drag.draggableProps}
                                        {...drag.dragHandleProps}
                                        label={emp?.name ?? '⚠ חסר'}
                                        size="small"
                                        color={s.is_conflict ? 'warning' : 'default'}
                                        sx={{ m: 0.25, cursor: schedule.status === 'published' ? 'default' : 'grab', fontSize: 11 }}
                                      />
                                    </Tooltip>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </Paper>
                        )}
                      </Droppable>
                    );
                  })}
                </>
              ))}
            </Box>
          </Box>
        </DragDropContext>
      )}
    </Box>
  );
}
