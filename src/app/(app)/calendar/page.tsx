'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { CalendarDays, Video, GripVertical, Clock, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Draggable } from '@fullcalendar/interaction';
import { MeetingsManager } from '@/components/calendar/MeetingsManager';

// FullCalendar needs dynamic import (no SSR)
const CalendarView = dynamic(
  () => import('@/components/calendar/CalendarView').then((m) => m.CalendarView),
  { ssr: false, loading: () => <div className="text-[var(--text-muted)] py-12 text-center">Loading calendar...</div> }
);

interface UnscheduledTask {
  id: string;
  title: string;
  priority: string;
  taskType: string;
  status: string;
  dueDate: string | null;
  goal?: { title: string; level: string; stack?: { name: string } } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'border-l-red-500',
  HIGH: 'border-l-orange-500',
  MEDIUM: 'border-l-yellow-500',
  LOW: 'border-l-green-500',
};

const PRIORITY_DOT_COLORS: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-green-500',
};

export default function CalendarPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const { data: tasksData, isLoading: loadingTasks, mutate: mutateTasks } = useSWR('/api/tasks?status=TODO');
  const unscheduledTasks = useMemo(() => {
    const tasks = Array.isArray(tasksData) ? tasksData : [];
    return tasks.filter(
      (t: any) => !t.timeBlockStart && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
    ) as UnscheduledTask[];
  }, [tasksData]);
  const [showMeetings, setShowMeetings] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable | null>(null);

  // Initialize FullCalendar Draggable on the sidebar container
  useEffect(() => {
    if (!sidebarRef.current) return;

    // Clean up previous instance
    if (draggableRef.current) {
      draggableRef.current.destroy();
    }

    draggableRef.current = new Draggable(sidebarRef.current, {
      itemSelector: '.fc-unscheduled-task',
      eventData: (eventEl) => {
        const taskId = eventEl.getAttribute('data-task-id') || '';
        const title = eventEl.getAttribute('data-task-title') || '';
        return {
          id: `task-${taskId}`,
          title,
          duration: '01:00',
          extendedProps: {
            taskId,
            source: 'tasks',
          },
          backgroundColor: '#6366f1',
          borderColor: '#4f46e5',
        };
      },
    });

    return () => {
      if (draggableRef.current) {
        draggableRef.current.destroy();
        draggableRef.current = null;
      }
    };
  }, [unscheduledTasks]); // Re-init when tasks change

  const handleEventClick = (info: any) => {
    const eventData = info.event.extendedProps;
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      ...eventData,
    });
  };

  const handleExternalDrop = (taskId: string) => {
    // Remove from unscheduled list after successful drop by revalidating
    mutateTasks(
      (current: any) => Array.isArray(current) ? current.filter((t: any) => t.id !== taskId) : current,
      { revalidate: false }
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-prism-indigo" />
          Calendar
        </h1>
        {isAdmin && (
          <button
            onClick={() => setShowMeetings(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            <Users className="h-4 w-4" />
            Manage Meetings
          </button>
        )}
      </div>

      <MeetingsManager open={showMeetings} onClose={() => setShowMeetings(false)} />

      <div className="flex gap-6">
        {/* Unscheduled Tasks Sidebar */}
        <div className="w-72 flex-shrink-0">
          <div className="glass-panel p-4 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Unscheduled Tasks</h2>
              <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {unscheduledTasks.length}
              </span>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Drag tasks onto the calendar to schedule them.
            </p>

            <div
              ref={sidebarRef}
              className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1"
            >
              {loadingTasks ? (
                <div className="text-center py-8">
                  <div className="text-[var(--text-muted)] text-sm">Loading tasks...</div>
                </div>
              ) : unscheduledTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[var(--text-muted)] text-sm">All tasks are scheduled!</p>
                </div>
              ) : (
                unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`fc-unscheduled-task cursor-grab active:cursor-grabbing rounded-lg border border-[var(--surface-raised)] border-l-4 ${
                      PRIORITY_COLORS[task.priority] || 'border-l-gray-600'
                    } bg-[var(--surface)] p-3 hover:bg-[var(--surface-raised)] transition-colors`}
                    data-task-id={task.id}
                    data-task-title={task.title}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text-primary)] font-medium truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              PRIORITY_DOT_COLORS[task.priority] || 'bg-gray-500'
                            }`}
                          />
                          <span className="text-xs text-[var(--text-muted)]">
                            {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                          </span>
                          {task.taskType === 'GOAL_STACK' && task.goal && (
                            <span className="text-xs text-indigo-400 truncate">
                              {task.goal.title}
                            </span>
                          )}
                        </div>
                        {task.dueDate && (
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            Due: {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Calendar + Event Details */}
        <div className="flex-1 min-w-0">
          <CalendarView
            onEventClick={handleEventClick}
            onExternalDrop={handleExternalDrop}
          />

          {/* Event details panel */}
          {selectedEvent && (
            <div className="mt-4 glass-panel p-4 space-y-3">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{selectedEvent.title}</h3>
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                <p>Source: {selectedEvent.source}</p>
                {selectedEvent.start && (
                  <p>Start: {new Date(selectedEvent.start).toLocaleString()}</p>
                )}
                {selectedEvent.end && (
                  <p>End: {new Date(selectedEvent.end).toLocaleString()}</p>
                )}
                {selectedEvent.status && <p>Status: {selectedEvent.status}</p>}
                {selectedEvent.cadence && <p>Cadence: {selectedEvent.cadence}</p>}
                {selectedEvent.createdBy && <p>Created by: {selectedEvent.createdBy}</p>}
                {selectedEvent.description && (
                  <p className="text-[var(--text-secondary)] mt-2">{selectedEvent.description}</p>
                )}
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
          )}
        </div>
      </div>
    </div>
  );
}
