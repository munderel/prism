'use client';

import { useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

interface CalendarViewProps {
  onEventClick?: (info: any) => void;
  onDateSelect?: (info: any) => void;
  onExternalDrop?: (taskId: string, start: Date, end: Date) => void;
}

const SOURCE_FILTERS = [
  { key: 'tasks', label: 'My Tasks', color: 'bg-indigo-500' },
  { key: 'reviews', label: 'Reviews', color: 'bg-yellow-500' },
  { key: 'meetings', label: 'Meetings', color: 'bg-emerald-500' },
  { key: 'google', label: 'Google Calendar', color: 'bg-purple-500' },
];

export function CalendarView({ onEventClick, onDateSelect, onExternalDrop }: CalendarViewProps) {
  const calendarRef = useRef<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'google']));

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
      }),
    });
  };

  const filteredEvents = events.filter((e) => activeFilters.has(e.source));

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
                ? 'bg-gray-800 text-white border border-gray-700'
                : 'text-gray-500 border border-gray-800 opacity-50'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="fc-dark-theme rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={filteredEvents}
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
        />
      </div>
    </div>
  );
}
