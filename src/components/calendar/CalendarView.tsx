'use client';

import { useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { autoSchedule, type ProposedSlot, type CalendarEvent as ScheduleEvent, type SchedulableTask } from '@/lib/scheduling-engine';
import { Sparkles, Check, X } from 'lucide-react';

interface CalendarViewProps {
  onEventClick?: (info: any) => void;
  onDateSelect?: (info: any) => void;
  onExternalDrop?: (taskId: string, start: Date, end: Date) => void;
  unscheduledTasks?: any[];
  onBatchScheduleConfirm?: (slots: Array<{ id: string; timeBlockStart: string; timeBlockEnd: string; isAutoScheduled: boolean; isPinned: boolean }>) => void;
}

const SOURCE_FILTERS = [
  { key: 'tasks', label: 'My Tasks', color: 'bg-indigo-500' },
  { key: 'reviews', label: 'Reviews', color: 'bg-yellow-500' },
  { key: 'meetings', label: 'Meetings', color: 'bg-emerald-500' },
  { key: 'aims', label: 'Aims', color: 'bg-teal-500' },
  { key: 'google', label: 'Google Calendar', color: 'bg-purple-500' },
];

export function CalendarView({ onEventClick, onDateSelect, onExternalDrop, unscheduledTasks, onBatchScheduleConfirm }: CalendarViewProps) {
  const calendarRef = useRef<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const { resolvedTheme } = useTheme();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'aims', 'google']));
  const [ghostEvents, setGhostEvents] = useState<ProposedSlot[]>([]);
  const [showGhosts, setShowGhosts] = useState(false);

  const fetchEvents = async (start: string, end: string) => {
    const res = await fetch(`/api/calendar?start=${start}&end=${end}&source=all`);
    if (res.ok) {
      setEvents(await res.json());
    }
  };

  const handleDatesSet = (info: any) => {
    fetchEvents(info.startStr, info.endStr);
  };

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEventReceive = async (info: any) => {
    // External drop from unscheduled sidebar
    const taskId = info.event.extendedProps?.taskId || info.event.id?.replace('task-', '');
    if (!taskId) return;

    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000); // default 1hr

    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeBlockStart: start.toISOString(),
        timeBlockEnd: end.toISOString(),
        dueDate: start.toISOString(),
      }),
    });

    // Refresh calendar events
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }

    onExternalDrop?.(taskId, start, end);
  };

  const handleEventDrop = async (info: any) => {
    const eventId = info.event.id;
    if (!eventId.startsWith('task-')) return;

    const taskId = eventId.replace('task-', '');
    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString();

    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeBlockStart: newStart,
        timeBlockEnd: newEnd,
        dueDate: newStart,
        isPinned: true,  // Manual drag = pinned
      }),
    });

    // TODO: Smart rearranging — re-run scheduler for flexible (non-pinned) tasks
    // after a manual drag to optimize remaining schedule around the pinned event.

    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }
  };

  const handleAutoSchedule = () => {
    if (!unscheduledTasks || unscheduledTasks.length === 0) return;

    // Convert unscheduled tasks to SchedulableTask format
    const schedulableTasks: SchedulableTask[] = unscheduledTasks.map((t) => ({
      id: t.id,
      title: t.title,
      estimatedMinutes: t.estimatedMinutes ?? 60,
      priority: t.priority ?? 'MEDIUM',
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      preferredTimeStart: t.preferredTimeStart ?? null,
      preferredTimeEnd: t.preferredTimeEnd ?? null,
    }));

    // Convert existing calendar events to CalendarEvent format for the engine
    const existingCalEvents: ScheduleEvent[] = events.map((e) => ({
      start: new Date(e.start),
      end: new Date(e.end),
    }));

    const proposed = autoSchedule(schedulableTasks, existingCalEvents, {
      start: '06:00',
      end: '22:00',
    });

    setGhostEvents(proposed);
    setShowGhosts(true);
  };

  const handleConfirmGhosts = () => {
    if (!onBatchScheduleConfirm) return;

    const slots = ghostEvents.map((g) => ({
      id: g.taskId,
      timeBlockStart: g.start.toISOString(),
      timeBlockEnd: g.end.toISOString(),
      isAutoScheduled: true,
      isPinned: false,
    }));

    onBatchScheduleConfirm(slots);
    setGhostEvents([]);
    setShowGhosts(false);
  };

  const handleDismissGhosts = () => {
    setGhostEvents([]);
    setShowGhosts(false);
  };

  const filteredEvents = events.filter((e) => activeFilters.has(e.source));

  const ghostCalendarEvents = showGhosts ? ghostEvents.map(g => ({
    id: `ghost-${g.taskId}`,
    title: `(Auto) ${unscheduledTasks?.find(t => t.id === g.taskId)?.title ?? 'Task'}`,
    start: g.start.toISOString(),
    end: g.end.toISOString(),
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    borderColor: '#6366f1',
    classNames: ['ghost-event'],
    editable: true,
    source: 'tasks',
  })) : [];

  const allDisplayEvents = [...filteredEvents, ...ghostCalendarEvents];

  return (
    <div>
      {/* Filter toggles */}
      <div className="flex items-center gap-3 mb-4">
        {SOURCE_FILTERS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilters.has(key)
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-color)]'
                : 'text-[var(--text-muted)] border border-[var(--surface-raised)] opacity-50'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Auto-schedule button / Confirm-Dismiss buttons */}
      <div className="flex items-center gap-2 mb-4">
        {!showGhosts && unscheduledTasks && unscheduledTasks.length > 0 && (
          <button
            onClick={handleAutoSchedule}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Auto-schedule ({unscheduledTasks.length})
          </button>
        )}

        {showGhosts && (
          <>
            <button
              onClick={handleConfirmGhosts}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Check className="h-4 w-4" />
              Confirm All
            </button>
            <button
              onClick={handleDismissGhosts}
              className="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
              Dismiss
            </button>
          </>
        )}
      </div>

      {/* Calendar */}
      <div className={`${resolvedTheme === 'dark' ? 'fc-dark-theme' : 'fc-light-theme'} glass-panel p-4`}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={allDisplayEvents}
          editable={true}
          selectable={true}
          droppable={true}
          eventDrop={handleEventDrop}
          eventReceive={handleEventReceive}
          eventClick={onEventClick}
          select={onDateSelect}
          datesSet={handleDatesSet}
          height="auto"
          nowIndicator={true}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          eventDidMount={(info) => {
            // Show pin icon on pinned events
            if (info.event.extendedProps?.isPinned) {
              const pinEl = document.createElement('span');
              pinEl.textContent = '\u{1F4CC}';
              pinEl.style.cssText = 'position:absolute;top:2px;right:4px;font-size:10px;';
              info.el.style.position = 'relative';
              info.el.appendChild(pinEl);
            }
          }}
        />
      </div>
    </div>
  );
}
