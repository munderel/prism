'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { CalendarDays, Video, GripVertical, Clock, Users, Flame, ClipboardList } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Draggable } from '@fullcalendar/interaction';
import { MeetingsManager } from '@/components/calendar/MeetingsManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
  estimatedMinutes?: number;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  goal?: { title: string; level: string; stack?: { name: string } } | null;
}

interface UnscheduledAim {
  id: string;
  type: 'aim';
  title: string;
  aimCategoryId: string;
  aimInstanceId?: string;
  duration: number;
  source: 'aims';
  activities: string[] | null;
}

interface UnscheduledReview {
  id: string;
  type: 'review';
  title: string;
  reviewId: string;
  reviewType: string;
  duration: number;
  scheduledDate: string;
  source: 'reviews';
}

type UnscheduledItem = {
  id: string;
  itemType: 'task' | 'aim' | 'review';
  title: string;
  duration: number; // minutes
  // Task-specific
  taskId?: string;
  priority?: string;
  taskType?: string;
  dueDate?: string | null;
  goal?: { title: string; level: string; stack?: { name: string } } | null;
  // Aim-specific
  aimCategoryId?: string;
  aimInstanceId?: string;
  activities?: string[] | null;
  // Review-specific
  reviewId?: string;
  reviewType?: string;
  scheduledDate?: string;
};

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

/* ------------------------------------------------------------------ */
/*  Shared card for unscheduled tasks / aims / reviews in the sidebar  */
/* ------------------------------------------------------------------ */

interface ItemTypeConfig {
  borderClass: string;
  icon: React.ReactNode;
  label: string;
  labelColor: string;
}

const ITEM_TYPE_CONFIG: Record<string, ItemTypeConfig> = {
  task: {
    borderClass: '', // filled dynamically from PRIORITY_COLORS
    icon: null,       // task uses the priority dot instead
    label: '',
    labelColor: '',
  },
  aim: {
    borderClass: 'border-l-teal-500',
    icon: <Flame className="h-3 w-3 text-teal-400" />,
    label: 'Aim',
    labelColor: 'text-teal-400',
  },
  review: {
    borderClass: 'border-l-amber-500',
    icon: <ClipboardList className="h-3 w-3 text-amber-400" />,
    label: '',        // filled dynamically from reviewType
    labelColor: 'text-amber-400',
  },
};

function UnscheduledItemCard({ item }: { item: UnscheduledItem }) {
  const cfg = ITEM_TYPE_CONFIG[item.itemType];

  // -- border colour --
  const borderClass =
    item.itemType === 'task'
      ? PRIORITY_COLORS[item.priority || ''] || 'border-l-gray-600'
      : cfg.borderClass;

  // -- data-* attributes for drag-and-drop --
  const dataAttrs: Record<string, string> = {
    'data-item-type': item.itemType,
    'data-item-id': item.id,
    'data-item-title': item.title,
    'data-duration': String(item.duration),
  };
  if (item.itemType === 'task' && item.taskId) {
    dataAttrs['data-task-id'] = item.taskId;
  }
  if (item.itemType === 'aim') {
    if (item.aimCategoryId) dataAttrs['data-aim-category-id'] = item.aimCategoryId;
    dataAttrs['data-aim-instance-id'] = item.aimInstanceId || '';
    dataAttrs['data-activities'] = item.activities ? JSON.stringify(item.activities) : '';
  }
  if (item.itemType === 'review' && item.reviewId) {
    dataAttrs['data-review-id'] = item.reviewId;
  }

  // -- metadata row --
  const renderMeta = () => {
    if (item.itemType === 'task') {
      const priorityLabel =
        (item.priority || 'MEDIUM').charAt(0) +
        (item.priority || 'MEDIUM').slice(1).toLowerCase();
      return (
        <>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                PRIORITY_DOT_COLORS[item.priority || ''] || 'bg-gray-500'
              }`}
            />
            <span className="text-xs text-[var(--text-muted)]">{priorityLabel}</span>
            {item.taskType === 'IMPROVE' && item.goal && (
              <span className="text-xs text-indigo-400 truncate">{item.goal.title}</span>
            )}
          </div>
          {item.dueDate && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Due: {new Date(item.dueDate).toLocaleDateString()}
            </p>
          )}
        </>
      );
    }

    // aim or review
    const label =
      item.itemType === 'review' ? item.reviewType || 'Review' : cfg.label;
    return (
      <div className="flex items-center gap-2 mt-1">
        {cfg.icon}
        <span className={`text-xs ${cfg.labelColor}`}>{label}</span>
        <span className="text-xs text-[var(--text-muted)]">{item.duration}min</span>
      </div>
    );
  };

  return (
    <div
      key={item.id}
      className={`fc-unscheduled-task cursor-grab active:cursor-grabbing rounded-lg border border-[var(--surface-raised)] border-l-4 ${borderClass} bg-[var(--surface)] p-3 hover:bg-[var(--surface-raised)] transition-colors`}
      {...dataAttrs}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--text-primary)] font-medium truncate">
            {item.title}
          </p>
          {renderMeta()}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const { data: tasksData, isLoading: loadingTasks, mutate: mutateTasks } = useSWR('/api/tasks?status=TODO');
  const { data: aimsData, isLoading: loadingAims, mutate: mutateAims } = useSWR<UnscheduledAim[]>('/api/aims/unscheduled');
  const { data: reviewsData, isLoading: loadingReviews, mutate: mutateReviews } = useSWR<UnscheduledReview[]>('/api/reviews/unscheduled');
  const { data: settingsData } = useSWR('/api/settings?scope=user');

  const scheduleSettings = useMemo(() => {
    if (!settingsData) return undefined;
    const s = settingsData;
    return {
      workingHoursStart: s.workingHoursStart ?? '09:00',
      workingHoursEnd: s.workingHoursEnd ?? '17:00',
      casualHoursStart: s.casualHoursStart ?? '17:00',
      casualHoursEnd: s.casualHoursEnd ?? '22:00',
      taskSchedulePeriod: s.taskSchedulePeriod ?? 'both',
    };
  }, [settingsData]);

  const unscheduledTasks = useMemo(() => {
    const tasks = Array.isArray(tasksData) ? tasksData : [];
    return tasks.filter(
      (t: any) => !t.timeBlockStart && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
    ) as UnscheduledTask[];
  }, [tasksData]);

  const allUnscheduledItems = useMemo(() => {
    const items: UnscheduledItem[] = [];

    // Tasks
    for (const task of unscheduledTasks) {
      items.push({
        id: `task-${task.id}`,
        itemType: 'task',
        title: task.title,
        duration: task.estimatedMinutes ?? 60,
        taskId: task.id,
        priority: task.priority,
        taskType: task.taskType,
        dueDate: task.dueDate,
        goal: task.goal,
      });
    }

    // Aims
    if (Array.isArray(aimsData)) {
      for (const aim of aimsData) {
        items.push({
          id: aim.id,
          itemType: 'aim',
          title: aim.title,
          duration: aim.duration,
          aimCategoryId: aim.aimCategoryId,
          aimInstanceId: aim.aimInstanceId,
          activities: aim.activities,
        });
      }
    }

    // Reviews
    if (Array.isArray(reviewsData)) {
      for (const review of reviewsData) {
        items.push({
          id: review.id,
          itemType: 'review',
          title: review.title,
          duration: review.duration,
          reviewId: review.reviewId,
          reviewType: review.reviewType,
          scheduledDate: review.scheduledDate,
        });
      }
    }

    return items;
  }, [unscheduledTasks, aimsData, reviewsData]);

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
        const itemType = eventEl.getAttribute('data-item-type') || 'task';
        const itemId = eventEl.getAttribute('data-item-id') || '';
        const title = eventEl.getAttribute('data-item-title') || '';
        const durationMin = parseInt(eventEl.getAttribute('data-duration') || '60', 10);
        const hours = Math.floor(durationMin / 60);
        const mins = durationMin % 60;
        const duration = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

        const colors: Record<string, { bg: string; border: string }> = {
          task: { bg: '#6366f1', border: '#4f46e5' },
          aim: { bg: '#14b8a6', border: '#0d9488' },
          review: { bg: '#f59e0b', border: '#d97706' },
        };

        const { bg, border } = colors[itemType] || colors.task;

        return {
          id: itemId,
          title,
          duration,
          extendedProps: {
            itemType,
            taskId: eventEl.getAttribute('data-task-id') || undefined,
            aimCategoryId: eventEl.getAttribute('data-aim-category-id') || undefined,
            aimInstanceId: eventEl.getAttribute('data-aim-instance-id') || undefined,
            activities: eventEl.getAttribute('data-activities') || undefined,
            reviewId: eventEl.getAttribute('data-review-id') || undefined,
            source: itemType === 'task' ? 'tasks' : itemType === 'aim' ? 'aims' : 'reviews',
          },
          backgroundColor: bg,
          borderColor: border,
        };
      },
    });

    return () => {
      if (draggableRef.current) {
        draggableRef.current.destroy();
        draggableRef.current = null;
      }
    };
  }, [allUnscheduledItems]); // Re-init when any items change

  const handleEventClick = (info: any) => {
    const eventData = info.event.extendedProps;
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      ...eventData,
    });
  };

  const handleExternalDrop = (itemId: string, _start: Date, _end: Date, itemType?: string) => {
    if (itemType === 'aim') {
      mutateAims();
    } else if (itemType === 'review') {
      mutateReviews();
    } else {
      // Default: task
      const taskId = itemId.replace('task-', '');
      mutateTasks(
        (current: any) => Array.isArray(current) ? current.filter((t: any) => t.id !== taskId) : current,
        { revalidate: false }
      );
    }
  };

  const isLoading = loadingTasks || loadingAims || loadingReviews;

  const renderItem = (item: UnscheduledItem) => (
    <UnscheduledItemCard key={item.id} item={item} />
  );

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

      <MeetingsManager open={showMeetings} onClose={() => setShowMeetings(false)} isAdmin={isAdmin} />

      <div className="flex gap-6">
        {/* Unscheduled Items Sidebar */}
        <div className="w-72 flex-shrink-0">
          <div className="glass-panel p-4 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Unscheduled Items</h2>
              <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {allUnscheduledItems.length}
              </span>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Drag items onto the calendar to schedule them.
            </p>

            <div
              ref={sidebarRef}
              className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1"
            >
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="text-[var(--text-muted)] text-sm">Loading...</div>
                </div>
              ) : allUnscheduledItems.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[var(--text-muted)] text-sm">Everything is scheduled!</p>
                </div>
              ) : (
                allUnscheduledItems.map(renderItem)
              )}
            </div>
          </div>
        </div>

        {/* Calendar + Event Details */}
        <div className="flex-1 min-w-0">
          <ErrorBoundary>
            <CalendarView
              onEventClick={handleEventClick}
              onExternalDrop={handleExternalDrop}
              unscheduledTasks={allUnscheduledItems}
              scheduleSettings={scheduleSettings}
            />
          </ErrorBoundary>

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
