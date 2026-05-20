'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { GripVertical, Clock, Loader2 } from 'lucide-react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { scheduleCalendarEvent, scheduleItemById } from './scheduleEvent';

export interface UnscheduledItem {
  id: string;
  title: string;
  estimatedMinutes?: number;
  type: string; // 'task' | 'aim' | 'review'
}

export interface InlineCalendarProps {
  /** ISO date string — which day (or week start) to display */
  date: string;
  viewType: 'timeGridDay' | 'timeGridWeek';
  workingHoursStart?: string; // "09:00"
  workingHoursEnd?: string;   // "21:00"
  unscheduledItems?: UnscheduledItem[];
  onItemScheduled?: (itemId: string, start: Date, end: Date, type: string) => void;
  /** If true, calendar events are read-only (no internal drag) */
  readOnly?: boolean;
}

export function InlineCalendar({
  date,
  viewType,
  workingHoursStart = '09:00',
  workingHoursEnd = '21:00',
  unscheduledItems = [],
  onItemScheduled,
  readOnly = false,
}: InlineCalendarProps) {
  const router = useRouter();
  const calendarRef = useRef<any>(null);
  const unscheduledListRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable | null>(null);
  const { resolvedTheme } = useTheme();

  // Compute the date range to fetch
  const { start, end } = useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    if (viewType === 'timeGridDay') {
      return { start: d.toISOString(), end: new Date(d.getTime() + 86400000).toISOString() };
    }
    // timeGridWeek — show full week starting from the given date
    const dayOfWeek = d.getDay();
    const weekStart = new Date(d.getTime() - dayOfWeek * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }, [date, viewType]);

  const { events, refreshEvents, isLoading: loading } = useCalendarEvents(start, end);

  // Navigate FullCalendar to the target date whenever it changes
  useEffect(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.gotoDate(date);
    }
  }, [date]);

  // Initialize external draggable on the unscheduled items list
  useEffect(() => {
    if (!unscheduledListRef.current) return;

    // Destroy previous draggable instance if any
    if (draggableRef.current) {
      draggableRef.current.destroy();
    }

    draggableRef.current = new Draggable(unscheduledListRef.current, {
      itemSelector: '[data-event]',
      eventData: (el) => {
        const raw = el.getAttribute('data-event');
        if (!raw) return {};
        try {
          const parsed = JSON.parse(raw);
          return {
            id: parsed.id,
            title: parsed.title,
            duration: parsed.duration,
            extendedProps: {
              itemType: parsed.itemType,
              taskId: parsed.taskId,
            },
          };
        } catch {
          return {};
        }
      },
    });

    return () => {
      if (draggableRef.current) {
        draggableRef.current.destroy();
        draggableRef.current = null;
      }
    };
  }, [unscheduledItems]);

  // Handle external item drop onto the calendar
  const handleEventReceive = async (info: any) => {
    const props = info.event.extendedProps || {};
    const itemType = props.itemType || 'task';
    const start = info.event.start;
    const fallbackMs = (props.durationMin ?? 60) * 60 * 1000;
    const end = info.event.end || new Date(start.getTime() + fallbackMs);

    const taskId = props.taskId || info.event.id?.replace('task-', '');

    try {
      if (taskId) {
        if (itemType === 'review') {
          // Reviews aren't covered by scheduleItemById (not a sidebar-drop type
          // for the other surfaces) — PATCH directly.
          const res = await fetch(`/api/reviews/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeBlockStart: start.toISOString(),
              timeBlockEnd: end.toISOString(),
            }),
          });
          if (!res.ok) throw new Error('Failed to schedule review');
        } else {
          await scheduleItemById(itemType, taskId, start, end);
        }
      }

      onItemScheduled?.(taskId || info.event.id, start, end, itemType);
      refreshEvents();
    } catch {
      info.event.remove();
    }
  };

  // Handle internal event drag (move existing events)
  const handleEventDrop = async (info: any) => {
    if (readOnly) {
      info.revert();
      return;
    }
    const start = info.event.start as Date | null;
    const end = info.event.end as Date | null;
    if (!start || !end) {
      info.revert();
      return;
    }
    try {
      const taskExtras = info.event.id.startsWith('task-')
        ? { isPinned: true }
        : undefined;
      await scheduleCalendarEvent(info.event, start, end, taskExtras);
      refreshEvents();
    } catch {
      info.revert();
      refreshEvents();
    }
  };

  // Build the event data for unscheduled items as draggable elements
  const buildDragData = (item: UnscheduledItem) => {
    const durationMinutes = item.estimatedMinutes || 60;
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return JSON.stringify({
      id: `${item.type}-${item.id}`,
      title: item.title,
      duration: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      itemType: item.type,
      taskId: item.id,
    });
  };

  // Route Task event clicks to the dedicated edit page (Component 13).
  // WorkBlock events route to /work-blocks/[id]/edit (Component 14).
  // Meeting and Google read-only events: no-op.
  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps || {};

    // WorkBlock event — route to the dedicated edit page (Component 14).
    if (info.event.id?.startsWith('workblock-') || (props.taskId && props.workBlockId)) {
      const workBlockId = typeof props.workBlockId === 'string'
        ? props.workBlockId
        : info.event.id?.startsWith('workblock-') ? info.event.id.replace('workblock-', '') : undefined;
      if (workBlockId) {
        router.push(`/work-blocks/${workBlockId}/edit`);
        return;
      }
    }

    // Task event (not a workblock)
    if (
      (props.taskId && !props.workBlockId && !info.event.id?.startsWith('workblock-')) ||
      info.event.id?.startsWith('task-')
    ) {
      const taskId = props.taskId || info.event.id?.replace('task-', '');
      if (taskId) {
        router.push(`/tasks/${taskId}/edit`);
      }
    }
    // Meeting, Google, and other events: no-op.
  };

  const typeColors: Record<string, string> = {
    task: 'bg-indigo-500',
    aim: 'bg-teal-500',
    review: 'bg-rose-500',
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Unscheduled items sidebar */}
      {unscheduledItems.length > 0 && (
        <div className="w-full lg:w-56 lg:flex-shrink-0">
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
            Unscheduled ({unscheduledItems.length})
          </p>
          <div ref={unscheduledListRef} className="space-y-1.5 max-h-[200px] lg:max-h-[500px] overflow-y-auto pr-1">
            {unscheduledItems.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                data-event={buildDragData(item)}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2.5 py-2 cursor-grab active:cursor-grabbing hover:border-indigo-500/40 transition-colors"
              >
                <GripVertical className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${typeColors[item.type] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-[var(--text-primary)] block truncate">{item.title}</span>
                </div>
                {item.estimatedMinutes && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] flex-shrink-0">
                    <Clock className="h-2.5 w-2.5" />
                    {item.estimatedMinutes}m
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="flex-1 min-w-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        )}
        <div className={`${resolvedTheme === 'dark' ? 'fc-dark-theme' : 'fc-light-theme'} ${loading ? 'opacity-50' : ''}`}>
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView={viewType}
            initialDate={date}
            headerToolbar={false}
            events={events}
            editable={!readOnly}
            droppable={true}
            eventDrop={handleEventDrop}
            eventReceive={handleEventReceive}
            eventClick={handleEventClick}
            height="auto"
            nowIndicator={true}
            slotMinTime={workingHoursStart + ':00'}
            slotMaxTime={workingHoursEnd + ':00'}
            allDaySlot={false}
            dayHeaderFormat={
              viewType === 'timeGridDay'
                ? { weekday: 'long', month: 'long', day: 'numeric' }
                : { weekday: 'short', month: 'numeric', day: 'numeric' }
            }
          />
        </div>
      </div>
    </div>
  );
}
