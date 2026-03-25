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
  onExternalDrop?: (itemId: string, start: Date, end: Date, itemType?: string) => void;
  unscheduledTasks?: any[];
  onBatchScheduleConfirm?: (slots: Array<{ id: string; timeBlockStart: string; timeBlockEnd: string; isAutoScheduled: boolean; isPinned: boolean; itemType?: string }>) => void;
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

  const refreshCalendar = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
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
    const props = info.event.extendedProps || {};
    const itemType = props.itemType || 'task';
    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    if (itemType === 'aim') {
      const aimInstanceId = props.aimInstanceId;
      const aimCategoryId = props.aimCategoryId;

      if (aimInstanceId) {
        // Update existing instance with time block
        await fetch(`/api/aims/instances/${aimInstanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
        });
      } else if (aimCategoryId) {
        // Create new instance with time block
        await fetch('/api/aims/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aimCategoryId,
            scheduledDate: startISO,
            timeBlockStart: startISO,
            timeBlockEnd: endISO,
          }),
        });
      }

      refreshCalendar();
      onExternalDrop?.(info.event.id, start, end, 'aim');
    } else if (itemType === 'review') {
      const reviewId = props.reviewId;
      if (reviewId) {
        await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
        });
      }

      refreshCalendar();
      onExternalDrop?.(info.event.id, start, end, 'review');
    } else {
      // Task (existing behavior)
      const taskId = props.taskId || info.event.id?.replace('task-', '');
      if (!taskId) return;

      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeBlockStart: startISO,
          timeBlockEnd: endISO,
          dueDate: startISO,
        }),
      });

      refreshCalendar();
      onExternalDrop?.(taskId, start, end, 'task');
    }
  };

  const handleEventDrop = async (info: any) => {
    const eventId = info.event.id;
    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString();

    if (eventId.startsWith('aim-instance-') || eventId.startsWith('aim-new-')) {
      // Aim instance drag on calendar
      const aimInstanceId = info.event.extendedProps?.aimInstanceId;
      if (aimInstanceId) {
        await fetch(`/api/aims/instances/${aimInstanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: newStart, timeBlockEnd: newEnd }),
        });
      }
    } else if (eventId.startsWith('review-')) {
      const reviewId = info.event.extendedProps?.reviewId || eventId.replace('review-', '');
      await fetch(`/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: newStart, timeBlockEnd: newEnd }),
      });
    } else if (eventId.startsWith('task-')) {
      const taskId = eventId.replace('task-', '');
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeBlockStart: newStart,
          timeBlockEnd: newEnd,
          dueDate: newStart,
          isPinned: true,
        }),
      });
    } else {
      // Unknown event type, skip
      return;
    }

    refreshCalendar();
  };

  const handleAutoSchedule = () => {
    if (!unscheduledTasks || unscheduledTasks.length === 0) return;

    // Convert all unscheduled items to SchedulableTask format
    const priorityMap: Record<string, SchedulableTask['priority']> = {
      aim: 'MEDIUM',
      review: 'HIGH',
    };

    const schedulableTasks: SchedulableTask[] = unscheduledTasks.map((t) => ({
      id: t.id,
      title: t.title,
      estimatedMinutes: t.duration ?? t.estimatedMinutes ?? 60,
      priority: t.priority ?? priorityMap[t.itemType] ?? 'MEDIUM',
      dueDate: t.dueDate ? new Date(t.dueDate) : t.scheduledDate ? new Date(t.scheduledDate) : null,
      preferredTimeStart: t.preferredTimeStart ?? null,
      preferredTimeEnd: t.preferredTimeEnd ?? null,
    }));

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

  const handleConfirmGhosts = async () => {
    // Schedule each ghost event via the appropriate API
    for (const ghost of ghostEvents) {
      const item = unscheduledTasks?.find((t) => t.id === ghost.taskId);
      const itemType = item?.itemType || 'task';
      const startISO = ghost.start.toISOString();
      const endISO = ghost.end.toISOString();

      if (itemType === 'aim') {
        const aimInstanceId = item?.aimInstanceId;
        if (aimInstanceId) {
          await fetch(`/api/aims/instances/${aimInstanceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
        } else if (item?.aimCategoryId) {
          await fetch('/api/aims/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aimCategoryId: item.aimCategoryId,
              scheduledDate: startISO,
              timeBlockStart: startISO,
              timeBlockEnd: endISO,
            }),
          });
        }
      } else if (itemType === 'review') {
        const reviewId = item?.reviewId;
        if (reviewId) {
          await fetch(`/api/reviews/${reviewId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
        }
      } else {
        // Task
        const taskId = item?.taskId || ghost.taskId.replace('task-', '');
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeBlockStart: startISO,
            timeBlockEnd: endISO,
            dueDate: startISO,
            isAutoScheduled: true,
            isPinned: false,
          }),
        });
      }
    }

    // Also call the batch callback if provided
    if (onBatchScheduleConfirm) {
      const slots = ghostEvents.map((g) => {
        const item = unscheduledTasks?.find((t) => t.id === g.taskId);
        return {
          id: g.taskId,
          timeBlockStart: g.start.toISOString(),
          timeBlockEnd: g.end.toISOString(),
          isAutoScheduled: true,
          isPinned: false,
          itemType: item?.itemType || 'task',
        };
      });
      onBatchScheduleConfirm(slots);
    }

    setGhostEvents([]);
    setShowGhosts(false);
    refreshCalendar();
  };

  const handleDismissGhosts = () => {
    setGhostEvents([]);
    setShowGhosts(false);
  };

  const filteredEvents = events.filter((e) => activeFilters.has(e.source));

  const ghostCalendarEvents = showGhosts ? ghostEvents.map(g => {
    const item = unscheduledTasks?.find(t => t.id === g.taskId);
    const itemType = item?.itemType || 'task';
    const ghostColors: Record<string, { bg: string; border: string }> = {
      task: { bg: 'rgba(99, 102, 241, 0.3)', border: '#6366f1' },
      aim: { bg: 'rgba(20, 184, 166, 0.3)', border: '#14b8a6' },
      review: { bg: 'rgba(245, 158, 11, 0.3)', border: '#f59e0b' },
    };
    const { bg, border } = ghostColors[itemType] || ghostColors.task;

    return {
      id: `ghost-${g.taskId}`,
      title: `(Auto) ${item?.title ?? 'Item'}`,
      start: g.start.toISOString(),
      end: g.end.toISOString(),
      backgroundColor: bg,
      borderColor: border,
      classNames: ['ghost-event'],
      editable: true,
      source: itemType === 'task' ? 'tasks' : itemType === 'aim' ? 'aims' : 'reviews',
    };
  }) : [];

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
