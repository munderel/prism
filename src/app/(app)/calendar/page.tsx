'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import dynamic from 'next/dynamic';
import { CalendarDays, Video, GripVertical, Clock, Users, Flame, Briefcase, Brain, RefreshCw, X, CalendarPlus, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import type { Draggable } from '@fullcalendar/interaction';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { MeetingsManager } from '@/components/calendar/MeetingsManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useToast } from '@/components/ui/ToastProvider';
import { freshFetcher } from '@/lib/fetcher';
import { useMediaQuery } from '@/hooks/useMediaQuery';


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

type UnscheduledItem = {
  id: string;
  itemType: 'task' | 'aim' | 'work_block';
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
};

function UnscheduledItemCard({ item, onTap, isSelected }: { item: UnscheduledItem; onTap?: (item: UnscheduledItem) => void; isSelected?: boolean }) {
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

  // -- metadata row --
  const priority = item.priority || 'MEDIUM';
  const priorityLabel = priority.charAt(0) + priority.slice(1).toLowerCase();

  const renderMeta = () => {
    if (item.itemType === 'task') {
      return (
        <>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                PRIORITY_DOT_COLORS[priority] || 'bg-gray-500'
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

    return (
      <div className="flex items-center gap-2 mt-1">
        {cfg.icon}
        <span className={`text-xs ${cfg.labelColor}`}>{cfg.label}</span>
        <span className="text-xs text-[var(--text-muted)]">{item.duration}min</span>
      </div>
    );
  };

  return (
    <div
      key={item.id}
      className={`fc-unscheduled-task rounded-lg border border-[var(--surface-raised)] border-l-4 ${borderClass} bg-[var(--surface)] p-3 hover:bg-[var(--surface-raised)] transition-colors min-h-[44px] ${
        onTap ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[var(--background)]' : ''}`}
      onClick={onTap ? () => onTap(item) : undefined}
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
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const { data: tasksData, isLoading: loadingTasks, mutate: mutateTasks } = useSWR('/api/tasks?status=TODO');
  const { data: aimsData, isLoading: loadingAims, mutate: mutateAims } = useSWR<UnscheduledAim[]>('/api/aims/unscheduled');
  const { data: settingsData } = useSWR('/api/settings?scope=user');
  const { data: deepWorkEffective } = useSWR<{
    active: boolean;
    effectiveDuration?: number;
    currentPhase?: string;
  }>('/api/aims/categories/deep-work/effective');
  const deepWorkDuration = deepWorkEffective?.active ? deepWorkEffective.effectiveDuration : undefined;

  const scheduleSettings = useMemo(() => {
    if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) return undefined;
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

    return items;
  }, [unscheduledTasks, aimsData]);

  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [scheduleModalItem, setScheduleModalItem] = useState<UnscheduledItem | null>(null);
  const [calendarNavigateTo, setCalendarNavigateTo] = useState<string | undefined>();
  const [showMeetings, setShowMeetings] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<Draggable | null>(null);

  // Initialize FullCalendar Draggable on the sidebar container (desktop only)
  useEffect(() => {
    if (!sidebarRef.current || isMobile) return;
    let cancelled = false;

    // Clean up previous instance
    if (draggableRef.current) {
      draggableRef.current.destroy();
    }

    import('@fullcalendar/interaction').then(({ Draggable: DraggableClass }) => {
      if (cancelled || !sidebarRef.current) return;

    draggableRef.current = new DraggableClass(sidebarRef.current, {
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
          work_block: { bg: '#6366f1', border: '#4f46e5' },
        };

        const { bg, border } = colors[itemType] || colors.task;

        return {
          id: itemId,
          title,
          duration,
          extendedProps: {
            itemType,
            durationMin,
            taskId: eventEl.getAttribute('data-task-id') || undefined,
            aimCategoryId: eventEl.getAttribute('data-aim-category-id') || undefined,
            aimInstanceId: eventEl.getAttribute('data-aim-instance-id') || undefined,
            activities: eventEl.getAttribute('data-activities') || undefined,
            source: itemType === 'task' ? 'tasks' : 'aims',
          },
          backgroundColor: bg,
          borderColor: border,
        };
      },
    });
    }); // end dynamic import .then()

    return () => {
      cancelled = true;
      if (draggableRef.current) {
        draggableRef.current.destroy();
        draggableRef.current = null;
      }
    };
  }, [isMobile]); // Only re-init when layout changes (Draggable uses CSS selector, reads data-* at drag time)

  const handleEventClick = (info: any) => {
    const eventData = info.event.extendedProps;
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      ...eventData,
    });
  };

  // Schedule an item to a specific time range (used by mobile modal)
  const scheduleMobileItem = async (item: UnscheduledItem, start: Date, end: Date) => {
    try {
      if (item.itemType === 'work_block') {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: item.title, start: start.toISOString(), end: end.toISOString() }),
        });
        if (!res.ok) throw new Error('Failed to create work block');
      } else if (item.itemType === 'aim') {
        if (item.aimInstanceId) {
          const res = await fetch(`/api/aims/instances/${item.aimInstanceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: start.toISOString(), timeBlockEnd: end.toISOString() }),
          });
          if (!res.ok) throw new Error('Failed to schedule aim');
        } else if (item.aimCategoryId) {
          const res = await fetch('/api/aims/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aimCategoryId: item.aimCategoryId,
              scheduledDate: start.toISOString(),
              timeBlockStart: start.toISOString(),
              timeBlockEnd: end.toISOString(),
            }),
          });
          if (!res.ok) throw new Error('Failed to schedule aim');
        }
        mutateAims();
      } else {
        const taskId = item.taskId || item.id.replace('task-', '');
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: start.toISOString(), timeBlockEnd: end.toISOString(), dueDate: start.toISOString() }),
        });
        if (!res.ok) throw new Error('Failed to schedule task');
        mutateTasks(
          (current: any) => Array.isArray(current) ? current.filter((t: any) => t.id !== taskId) : current,
          { revalidate: false },
        );
      }
      globalMutate(
        (key: unknown) => typeof key === 'string' && key.startsWith('/api/calendar'),
        undefined,
        { revalidate: true },
      );
      toast.success(`Scheduled "${item.title}"`);
    } catch {
      toast.error('Failed to schedule item');
    }
  };

  const handleMobileItemTap = (item: UnscheduledItem) => {
    setScheduleModalItem(item);
    setShowMobileSheet(false);
  };

  const handleExternalDrop = (itemId: string, _start: Date, _end: Date, itemType?: string) => {
    if (itemType === 'aim') {
      mutateAims();
    } else {
      // Default: task
      const taskId = itemId.replace('task-', '');
      mutateTasks(
        (current: any) => Array.isArray(current) ? current.filter((t: any) => t.id !== taskId) : current,
        { revalidate: true }
      );
    }
  };

  const handleSync = async (forceResync = false) => {
    setSyncing(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, ...(forceResync && { force: true }) }),
      });
      if (res.ok) {
        const data = await res.json();
        const count = data.updates?.length ?? 0;
        toast.success(
          forceResync
            ? `Force resync complete — ${count} change${count === 1 ? '' : 's'} applied`
            : count > 0
              ? `Synced ${count} change${count === 1 ? '' : 's'} from Google Calendar`
              : 'Calendar is up to date'
        );
        // Invalidate all calendar SWR caches (any date range) so CalendarView refreshes
        globalMutate(
          (key: unknown) => typeof key === 'string' && key.startsWith('/api/calendar'),
          undefined,
          { revalidate: true }
        );
        mutateTasks(freshFetcher('/api/tasks?status=TODO'));
        mutateAims();
      } else {
        toast.error('Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const isLoading = loadingTasks || loadingAims;

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6 text-prism-indigo" />
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-amber-400 hover:text-amber-300 hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
            title="Clear all sync state and recreate recurring events from scratch. Use if you see duplicates."
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Resyncing...' : 'Force Resync'}
          </button>
        {isAdmin && (
          <button
            onClick={() => setShowMeetings(true)}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-emerald-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Manage Meetings</span>
            <span className="sm:hidden">Meetings</span>
          </button>
        )}
        </div>
      </div>

      <MeetingsManager open={showMeetings} onClose={() => setShowMeetings(false)} isAdmin={isAdmin} />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Unscheduled Items Sidebar — desktop only */}
        <div className="hidden lg:block w-72 flex-shrink-0" ref={sidebarRef}>
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
              className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1"
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
                allUnscheduledItems.map((item) => (
                  <UnscheduledItemCard key={item.id} item={item} />
                ))
              )}
            </div>

            {/* Work Block Templates */}
            <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Work Blocks</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-2">Drag onto calendar to create blocks.</p>
              <div className="space-y-2">
                <div
                  className="fc-unscheduled-task cursor-grab active:cursor-grabbing rounded-lg border border-indigo-500/30 border-l-4 border-l-indigo-500 bg-indigo-500/10 p-3 hover:bg-indigo-500/20 transition-colors"
                  data-item-type="work_block"
                  data-item-id="__work_block_template__"
                  data-item-title="Work Block"
                  data-duration="60"
                >
                  <div className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[var(--text-primary)] font-medium">Normal Work Block</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">60min</p>
                    </div>
                  </div>
                </div>
                {deepWorkDuration != null && (
                  <div
                    className="fc-unscheduled-task cursor-grab active:cursor-grabbing rounded-lg border border-teal-500/30 border-l-4 border-l-teal-500 bg-teal-500/10 p-3 hover:bg-teal-500/20 transition-colors"
                    data-item-type="aim"
                    data-item-id="__deep_work_template__"
                    data-item-title="Deep Work Block"
                    data-duration={String(deepWorkDuration)}
                    data-aim-category-id="deep-work"
                  >
                    <div className="flex items-start gap-2">
                      <Brain className="h-4 w-4 text-teal-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">Deep Work Block</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{deepWorkDuration}min</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
              navigateTo={calendarNavigateTo}
            />
          </ErrorBoundary>

          {/* Event details panel */}
          {selectedEvent && (
            <div className="mt-4 glass-panel p-3 sm:p-4 space-y-3">
              <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">{selectedEvent.title}</h3>
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

      {/* Mobile FAB — open unscheduled items sheet */}
      {!showMobileSheet && (
        <button
          onClick={() => setShowMobileSheet(true)}
          className="fixed bottom-6 left-4 z-40 lg:hidden flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-lg hover:bg-indigo-500 transition-colors"
        >
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">{allUnscheduledItems.length}</span>
        </button>
      )}

      {/* Mobile bottom sheet for unscheduled items */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {showMobileSheet && (
            <>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/40 lg:hidden"
                onClick={() => setShowMobileSheet(false)}
              />
              <m.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] rounded-t-xl border-t border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-xl lg:hidden flex flex-col"
              >
                {/* Sheet handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/30" />
                </div>

                {/* Sheet header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Unscheduled Items</h2>
                    <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {allUnscheduledItems.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowMobileSheet(false)}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <p className="text-xs text-[var(--text-muted)] px-4 pt-3 pb-2">
                  Tap an item to pick a date and time to schedule it.
                </p>

                {/* Scrollable item list */}
                <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                  {isLoading ? (
                    <div className="text-center py-8">
                      <div className="text-[var(--text-muted)] text-sm">Loading...</div>
                    </div>
                  ) : allUnscheduledItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-[var(--text-muted)] text-sm">Everything is scheduled!</p>
                    </div>
                  ) : (
                    allUnscheduledItems.map((item) => (
                      <UnscheduledItemCard
                        key={item.id}
                        item={item}
                        onTap={handleMobileItemTap}
                        isSelected={scheduleModalItem?.id === item.id}
                      />
                    ))
                  )}

                  {/* Work Block Templates */}
                  <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Briefcase className="h-4 w-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Work Blocks</h3>
                    </div>
                    <div className="space-y-2">
                      <div
                        onClick={() => handleMobileItemTap({ id: '__work_block_template__', itemType: 'work_block', title: 'Work Block', duration: 60 } as UnscheduledItem)}
                        className={`cursor-pointer rounded-lg border border-indigo-500/30 border-l-4 border-l-indigo-500 bg-indigo-500/10 p-3 hover:bg-indigo-500/20 transition-colors min-h-[44px] ${
                          scheduleModalItem?.id === '__work_block_template__' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[var(--background)]' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Briefcase className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-[var(--text-primary)] font-medium">Normal Work Block</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">60min</p>
                          </div>
                        </div>
                      </div>
                      {deepWorkDuration != null && (
                        <div
                          onClick={() => handleMobileItemTap({ id: '__deep_work_template__', itemType: 'aim', title: 'Deep Work Block', duration: deepWorkDuration, aimCategoryId: 'deep-work' } as UnscheduledItem)}
                          className={`cursor-pointer rounded-lg border border-teal-500/30 border-l-4 border-l-teal-500 bg-teal-500/10 p-3 hover:bg-teal-500/20 transition-colors min-h-[44px] ${
                            scheduleModalItem?.id === '__deep_work_template__' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[var(--background)]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <Brain className="h-4 w-4 text-teal-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-[var(--text-primary)] font-medium">Deep Work Block</p>
                              <p className="text-xs text-[var(--text-muted)] mt-0.5">{deepWorkDuration}min</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </LazyMotion>

      {/* Mobile Schedule Modal */}
      {scheduleModalItem && (
        <MobileScheduleModal
          item={scheduleModalItem}
          onSchedule={async (start, end) => {
            await scheduleMobileItem(scheduleModalItem, start, end);
            setScheduleModalItem(null);
            setCalendarNavigateTo(start.toISOString());
          }}
          onCancel={() => setScheduleModalItem(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Schedule Modal                                              */
/* ------------------------------------------------------------------ */

function getDefaultTime(): string {
  const now = new Date();
  const mins = now.getMinutes();
  // Round up to next 30-min slot
  if (mins <= 30) {
    now.setMinutes(30, 0, 0);
  } else {
    now.setHours(now.getHours() + 1, 0, 0, 0);
  }
  // Clamp to 23:30 to prevent rolling over to next day's midnight
  const hours = now.getHours();
  if (hours === 0 && mins > 30) return '23:30';
  return `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MobileScheduleModal({
  item,
  onSchedule,
  onCancel,
}: {
  item: UnscheduledItem;
  onSchedule: (start: Date, end: Date) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(() => getToday());
  const [time, setTime] = useState(() => getDefaultTime());
  const [scheduling, setScheduling] = useState(false);
  const duration = item.duration ?? 60;

  const handleConfirm = async () => {
    setScheduling(true);
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    await onSchedule(start, end);
    setScheduling(false);
  };

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full sm:max-w-sm rounded-t-xl sm:rounded-xl border border-[var(--border-color)] bg-[var(--surface)] shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarPlus className="h-5 w-5 text-indigo-400 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">Schedule item</h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Item name */}
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDuration(duration)}</p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Start time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={scheduling}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
