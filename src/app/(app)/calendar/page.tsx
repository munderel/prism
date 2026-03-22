'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CalendarDays, Video } from 'lucide-react';

// FullCalendar needs dynamic import (no SSR)
const CalendarView = dynamic(
  () => import('@/components/calendar/CalendarView').then((m) => m.CalendarView),
  { ssr: false, loading: () => <div className="text-gray-500 py-12 text-center">Loading calendar...</div> }
);

export default function CalendarPage() {
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const handleEventClick = (info: any) => {
    const eventData = info.event.extendedProps;
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      ...eventData,
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-indigo-400" />
          Calendar
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <CalendarView onEventClick={handleEventClick} />
        </div>

        <div className="lg:col-span-1">
          {selectedEvent ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
              <h3 className="text-lg font-semibold text-white">{selectedEvent.title}</h3>
              <div className="text-xs text-gray-500 space-y-1">
                <p>Source: {selectedEvent.source}</p>
                {selectedEvent.start && (
                  <p>Start: {new Date(selectedEvent.start).toLocaleString()}</p>
                )}
                {selectedEvent.end && (
                  <p>End: {new Date(selectedEvent.end).toLocaleString()}</p>
                )}
                {selectedEvent.status && <p>Status: {selectedEvent.status}</p>}
              </div>
              {selectedEvent.meetLink && (
                <a
                  href={selectedEvent.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
                >
                  <Video className="h-4 w-4" />
                  Join Google Meet
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 text-center">
              <p className="text-gray-600 text-sm">Click an event for details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
