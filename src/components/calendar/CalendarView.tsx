'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { type ProposedSlot } from '@/lib/scheduling-engine';
import { Check, X, ListTodo, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { ActivitySelectModal } from './ActivitySelectModal';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';

interface SelectedEventPopover {
  eventId: string;
  title: string;
  source: 'aims' | 'task';
  status: string;
  position: { top: number; left: number };
  // Aim-specific
  aimInstanceId?: string;
  aimCategoryName?: string;
  selectedActivity?: string;
  // Task-specific
  taskId?: string;
  taskType?: string;
  priority?: string;
  goalTitle?: string;
}

interface AimTask {
  id: string;
  title: string;
  status: string;
}

interface SelectedAimInstance {
  aimInstanceId: string;
  title: string;
  tasks: AimTask[];
}

interface CalendarViewProps {
  onEventClick?: (info: any) => void;
  onDateSelect?: (info: any) => void;
  onExternalDrop?: (itemId: string, start: Date, end: Date, itemType?: string) => void;
  unscheduledTasks?: any[];
  onBatchScheduleConfirm?: (slots: Array<{ id: string; timeBlockStart: string; timeBlockEnd: string; isAutoScheduled: boolean; isPinned: boolean; itemType?: string }>) => void;
  scheduleSettings?: {
    workingHoursStart: string;
    workingHoursEnd: string;
    casualHoursStart: string;
    casualHoursEnd: string;
    taskSchedulePeriod: string;
  };
}

const SOURCE_FILTERS = [
  { key: 'tasks', label: 'My Tasks', color: 'bg-indigo-500' },
  { key: 'reviews', label: 'Reviews', color: 'bg-yellow-500' },
  { key: 'meetings', label: 'Meetings', color: 'bg-emerald-500' },
  { key: 'aims', label: 'Aims', color: 'bg-teal-500' },
  { key: 'google', label: 'Google Calendar', color: 'bg-purple-500' },
  { key: 'powerdown', label: 'Power Down', color: 'bg-violet-500' },
  { key: 'processes', label: 'Processes', color: 'bg-cyan-500' },
];

const TASK_TYPE_BADGE_STYLES: Record<string, string> = {
  IMPROVE: 'bg-indigo-500/15 text-indigo-400',
  REACT: 'bg-yellow-500/15 text-yellow-400',
  MAINTENANCE: 'bg-cyan-500/15 text-cyan-400',
};

const TASK_STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  DONE: { dot: 'bg-emerald-400', label: 'Done' },
  IN_PROGRESS: { dot: 'bg-blue-400', label: 'In Progress' },
};

const DEFAULT_TASK_STATUS = { dot: 'bg-gray-400', label: 'To Do' };

function scheduleItem(
  itemType: string,
  itemId: string,
  startISO: string,
  endISO: string,
  extraData?: Record<string, unknown>
): Promise<Response> {
  const endpoints: Record<string, string> = {
    aim: `/api/aims/instances/${itemId}`,
    task: `/api/tasks/${itemId}`,
  };
  return fetch(endpoints[itemType] || endpoints.task, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO, ...extraData }),
  });
}

export function CalendarView({ onEventClick, onDateSelect, onExternalDrop, unscheduledTasks, onBatchScheduleConfirm, scheduleSettings: _scheduleSettings }: CalendarViewProps) {
  const router = useRouter();
  const toast = useToast();
  const calendarRef = useRef<any>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const { events, error: calendarError, refreshEvents, googleStatus, googleError, isLoading: calendarLoading } = useCalendarEvents(dateRange?.start ?? null, dateRange?.end ?? null);
  const { resolvedTheme } = useTheme();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'aims', 'google', 'powerdown', 'processes']));
  const [ghostEvents, setGhostEvents] = useState<ProposedSlot[]>([]);
  const [showGhosts, setShowGhosts] = useState(false);

  // Event detail popover state
  const [selectedEventPopover, setSelectedEventPopover] = useState<SelectedEventPopover | null>(null);
  const [completingEvent, setCompletingEvent] = useState(false);

  // Dismiss popover on outside click
  useEffect(() => {
    if (!selectedEventPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedEventPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedEventPopover]);

  // Activity selection modal state
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [pendingAimDrop, setPendingAimDrop] = useState<{ info: any; startISO: string; endISO: string } | null>(null);
  const [pendingActivities, setPendingActivities] = useState<string[]>([]);
  const [pendingAimName, setPendingAimName] = useState('');

  // Task assignment panel state (Deep Work as task container)
  const [selectedAimInstance, setSelectedAimInstance] = useState<SelectedAimInstance | null>(null);
  const [showTaskAssignment, setShowTaskAssignment] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [savingTasks, setSavingTasks] = useState(false);

  const handleDatesSet = (info: any) => {
    setDateRange({ start: info.startStr, end: info.endStr });
  };

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // --- Completion handler (shared for aims and tasks) ---
  const handleComplete = useCallback(async (
    endpoint: string,
    status: string,
    label: string,
  ) => {
    setCompletingEvent(true);
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`${label} completed!`);
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error(`Failed to complete ${label.toLowerCase()}`);
      }
    } catch {
      toast.error(`Failed to complete ${label.toLowerCase()}`);
    } finally {
      setCompletingEvent(false);
    }
  }, [toast, refreshEvents]);

  const handleCompleteAim = useCallback(
    (aimInstanceId: string) => handleComplete(`/api/aims/instances/${aimInstanceId}`, 'COMPLETED', 'Aim'),
    [handleComplete],
  );

  const handleCompleteTask = useCallback(
    (taskId: string) => handleComplete(`/api/tasks/${taskId}`, 'DONE', 'Task'),
    [handleComplete],
  );

  // --- Task assignment handlers ---
  const handleEventClick = (info: any) => {
    const props = info.event.extendedProps || {};
    const rect = info.el.getBoundingClientRect();

    // If this is a powerdown event, navigate to powerdown page
    if (props.link === '/powerdown' || info.event.id?.startsWith('powerdown-')) {
      router.push('/powerdown');
      return;
    }

    // If this is a virtual review event (weekly/monthly/yearly/team), use the link which contains action params
    if (info.event.id?.startsWith('weekly-review-') || info.event.id?.startsWith('monthly-review-') || info.event.id?.startsWith('yearly-review-') || info.event.id?.startsWith('team-review-')) {
      const link = props.link || '/reviews';
      router.push(link);
      return;
    }

    // If this is a stored review event (already in DB), navigate to its completion wizard
    if (info.event.id?.startsWith('review-')) {
      const reviewId = props.reviewId;
      if (reviewId) {
        router.push(`/reviews/${reviewId}/complete`);
        return;
      }
    }

    // If this is a process event, navigate to processes page
    if (info.event.id?.startsWith('process-')) {
      router.push('/processes');
      return;
    }

    // If this is an aim event, show popover with Complete action
    if (props.aimInstanceId) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'aims',
        status: props.status || 'SCHEDULED',
        position: { top: rect.top + window.scrollY, left: rect.right + 8 },
        aimInstanceId: props.aimInstanceId,
        aimCategoryName: props.aimCategoryName,
        selectedActivity: props.selectedActivity,
      });
      return;
    }

    // If this is a task event, show popover with Complete action
    if (props.taskId || info.event.id?.startsWith('task-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'task',
        status: props.status || 'TODO',
        position: { top: rect.top + window.scrollY, left: rect.right + 8 },
        taskId: props.taskId || info.event.id?.replace('task-', ''),
        taskType: props.taskType,
        priority: props.priority,
        goalTitle: props.goalTitle,
      });
      return;
    }

    // Otherwise, delegate to parent handler
    onEventClick?.(info);
  };

  const handlePopoverOpenTasks = () => {
    if (!selectedEventPopover || selectedEventPopover.source !== 'aims') return;
    // Open the task assignment panel for this aim
    const aimEvent = events.find((e: any) => e.aimInstanceId === selectedEventPopover.aimInstanceId);
    if (aimEvent) {
      const aimData: SelectedAimInstance = {
        aimInstanceId: aimEvent.aimInstanceId,
        title: aimEvent.aimCategoryName || aimEvent.title,
        tasks: aimEvent.tasks || [],
      };
      setSelectedAimInstance(aimData);
      const currentIds = new Set<string>((aimData.tasks || []).map((t: AimTask) => t.id));
      setSelectedTaskIds(currentIds);
      setShowTaskAssignment(true);
    }
    setSelectedEventPopover(null);
  };

  const handleCloseTaskAssignment = () => {
    setShowTaskAssignment(false);
    setSelectedAimInstance(null);
    setSelectedTaskIds(new Set());
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleSaveTaskAssignment = async () => {
    if (!selectedAimInstance) return;
    setSavingTasks(true);
    try {
      const res = await fetch(`/api/aims/instances/${selectedAimInstance.aimInstanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedTaskIds) }),
      });
      if (res.ok) {
        handleCloseTaskAssignment();
        refreshEvents();
      }
    } finally {
      setSavingTasks(false);
    }
  };

  // --- Event receive / drop handlers ---
  const handleEventReceive = async (info: any) => {
    const props = info.event.extendedProps || {};
    const itemType = props.itemType || 'task';
    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    try {
      if (itemType === 'aim') {
        const aimInstanceId = props.aimInstanceId;
        const aimCategoryId = props.aimCategoryId;

        // Check if this aim has activities that need selection
        let activities: string[] = [];
        try {
          const activitiesRaw = props.activities;
          if (activitiesRaw) {
            activities = JSON.parse(activitiesRaw);
          }
        } catch {
          // ignore parse errors
        }

        if (activities.length > 0) {
          // Store the drop info and show the activity selection modal
          setPendingAimDrop({ info, startISO, endISO });
          setPendingActivities(activities);
          setPendingAimName(info.event.title);
          setShowActivityModal(true);
          return;
        }

        if (aimInstanceId) {
          const res = await scheduleItem('aim', aimInstanceId, startISO, endISO);
          if (!res.ok) throw new Error('Failed to schedule aim');
        } else if (aimCategoryId) {
          // Create new instance with time block
          const res = await fetch('/api/aims/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aimCategoryId,
              scheduledDate: startISO,
              timeBlockStart: startISO,
              timeBlockEnd: endISO,
            }),
          });
          if (!res.ok) throw new Error('Failed to create aim instance');
        }

        refreshEvents();
        onExternalDrop?.(info.event.id, start, end, 'aim');
      } else if (itemType === 'work_block') {
        // Create a Google Calendar event for a normal work block
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: 'Work Block', start: startISO, end: endISO }),
        });
        if (!res.ok) throw new Error('Failed to create work block');
        refreshEvents();
      } else {
        const taskId = props.taskId || info.event.id?.replace('task-', '');
        if (!taskId) return;

        const res = await scheduleItem('task', taskId, startISO, endISO, { dueDate: startISO });
        if (!res.ok) throw new Error('Failed to schedule task');

        refreshEvents();
        onExternalDrop?.(taskId, start, end, 'task');
      }
    } catch {
      info.event.remove();
      toast.error('Failed to schedule item. Please try again.');
    }
  };

  const handleEventDrop = async (info: any) => {
    const eventId = info.event.id;
    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString();

    if (eventId.startsWith('aim-instance-') || eventId.startsWith('aim-new-') || eventId.startsWith('aim-')) {
      // One-time adjustment: PATCH the specific aim instance
      const aimInstanceId = info.event.extendedProps?.aimInstanceId;
      if (aimInstanceId) {
        await scheduleItem('aim', aimInstanceId, newStart, newEnd);
      }
    } else if (eventId.startsWith('powerdown-')) {
      // One-time adjustment for this specific day only (not the recurring default)
      // Extract the date from the event ID (format: powerdown-YYYY-MM-DD)
      const dateStr = eventId.replace('powerdown-', '');
      await fetch('/api/powerdown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionDate: dateStr,
          timeBlockStart: newStart,
          timeBlockEnd: newEnd,
        }),
      });
    } else if (eventId.startsWith('process-')) {
      // Per-execution override: extract processId and date from "process-{cuid}-YYYY-MM-DD"
      const parts = eventId.split('-');
      const dateStr = parts.slice(-3).join('-');
      const processId = parts.slice(1, -3).join('-');
      await fetch(`/api/processes/${processId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate: dateStr,
          timeBlockStart: newStart,
          timeBlockEnd: newEnd,
        }),
      });
    } else if (eventId.startsWith('task-')) {
      const taskId = eventId.replace('task-', '');
      await scheduleItem('task', taskId, newStart, newEnd, { dueDate: newStart, isPinned: true });
    } else {
      return;
    }

    refreshEvents();
  };

  // Auto-schedule feature removed — users schedule manually via drag-and-drop

  const handleConfirmGhosts = async () => {
    // Schedule all ghost events in parallel
    await Promise.all(ghostEvents.map((ghost) => {
      const item = unscheduledTasks?.find((t) => t.id === ghost.taskId);
      const itemType = item?.itemType || 'task';
      const startISO = ghost.start.toISOString();
      const endISO = ghost.end.toISOString();

      if (itemType === 'aim') {
        const aimInstanceId = item?.aimInstanceId;
        if (aimInstanceId) {
          return scheduleItem('aim', aimInstanceId, startISO, endISO);
        } else if (item?.aimCategoryId) {
          return fetch('/api/aims/instances', {
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
      } else {
        const taskId = item?.taskId || ghost.taskId.replace('task-', '');
        return scheduleItem('task', taskId, startISO, endISO, {
          dueDate: startISO,
          isAutoScheduled: true,
          isPinned: false,
        });
      }
    }));

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
    refreshEvents();
  };

  const handleDismissGhosts = () => {
    setGhostEvents([]);
    setShowGhosts(false);
  };

  const handleActivitySelect = async (activity: string) => {
    if (!pendingAimDrop) return;

    const { info, startISO, endISO } = pendingAimDrop;
    const props = info.event.extendedProps || {};
    const aimInstanceId = props.aimInstanceId;
    const aimCategoryId = props.aimCategoryId;

    if (aimInstanceId) {
      await fetch(`/api/aims/instances/${aimInstanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO, selectedActivity: activity }),
      });
    } else if (aimCategoryId) {
      await fetch('/api/aims/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aimCategoryId,
          scheduledDate: startISO,
          timeBlockStart: startISO,
          timeBlockEnd: endISO,
          selectedActivity: activity,
        }),
      });
    }

    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000);

    setShowActivityModal(false);
    setPendingAimDrop(null);
    setPendingActivities([]);
    setPendingAimName('');
    refreshEvents();
    onExternalDrop?.(info.event.id, start, end, 'aim');
  };

  const handleActivityModalClose = () => {
    // If they cancel, revert the dropped event from the calendar
    if (pendingAimDrop) {
      pendingAimDrop.info.event.remove();
    }
    setShowActivityModal(false);
    setPendingAimDrop(null);
    setPendingActivities([]);
    setPendingAimName('');
  };

  // Get TODO tasks available for assignment (from unscheduledTasks prop)
  const availableTodoTasks = (unscheduledTasks || []).filter(
    (t: any) => t.itemType !== 'aim' && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
  );

  const filteredEvents = events.filter((e: any) => activeFilters.has(e.source));

  const ghostCalendarEvents = showGhosts ? ghostEvents.map(g => {
    const item = unscheduledTasks?.find(t => t.id === g.taskId);
    const itemType = item?.itemType || 'task';
    const ghostColors: Record<string, { bg: string; border: string }> = {
      task: { bg: 'rgba(99, 102, 241, 0.3)', border: '#6366f1' },
      aim: { bg: 'rgba(20, 184, 166, 0.3)', border: '#14b8a6' },
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
      source: itemType === 'task' ? 'tasks' : 'aims',
    };
  }) : [];

  const allDisplayEvents = [...filteredEvents, ...ghostCalendarEvents];

  return (
    <div className="relative">
      {/* Google Calendar connection warning */}
      {googleStatus === 'error' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <span>Google Calendar events could not be loaded{googleError ? `: ${googleError}` : '.'}</span>
          <a href="/settings" className="ml-auto whitespace-nowrap text-amber-400 underline hover:text-amber-300">Reconnect in Settings</a>
        </div>
      )}
      {googleStatus === 'not_connected' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          <span>Google Calendar is not connected.</span>
          <a href="/settings" className="ml-auto whitespace-nowrap text-blue-400 underline hover:text-blue-300">Connect in Settings</a>
        </div>
      )}
      {!!calendarError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>Failed to load calendar events{calendarError instanceof Error && calendarError.message ? `: ${calendarError.message}` : '. Please try refreshing the page.'}</span>
          <button onClick={() => refreshEvents()} className="ml-auto whitespace-nowrap text-red-400 underline hover:text-red-300">Retry</button>
        </div>
      )}
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
        {/* Auto-schedule removed — users schedule manually via drag-and-drop */}

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

      {/* Activity selection modal for aims with activities */}
      <ActivitySelectModal
        open={showActivityModal}
        onClose={handleActivityModalClose}
        onSelect={handleActivitySelect}
        activities={pendingActivities}
        aimName={pendingAimName}
      />

      {/* Event Detail Popover */}
      {selectedEventPopover && (
        <div
          ref={popoverRef}
          className="fixed z-[60] w-72 rounded-xl border border-[var(--border-color)] bg-[var(--surface-base)] shadow-2xl"
          style={{
            top: Math.min(selectedEventPopover.position.top, window.innerHeight - 280),
            left: Math.min(selectedEventPopover.position.left, window.innerWidth - 300),
          }}
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate pr-2">
              {selectedEventPopover.title}
            </h4>
            <button
              onClick={() => setSelectedEventPopover(null)}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Popover Body */}
          <div className="px-4 py-3 space-y-2.5">
            {/* AIM popover */}
            {selectedEventPopover.source === 'aims' && (
              <>
                {selectedEventPopover.aimCategoryName && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium">Aim:</span> {selectedEventPopover.aimCategoryName}
                  </div>
                )}
                {selectedEventPopover.selectedActivity && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium">Activity:</span> {selectedEventPopover.selectedActivity}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${
                    selectedEventPopover.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-teal-400'
                  }`} />
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {selectedEventPopover.status === 'COMPLETED' ? 'Completed' : 'Scheduled'}
                  </span>
                </div>
              </>
            )}

            {/* TASK popover */}
            {selectedEventPopover.source === 'task' && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedEventPopover.taskType && (
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      TASK_TYPE_BADGE_STYLES[selectedEventPopover.taskType] ?? 'bg-cyan-500/15 text-cyan-400'
                    }`}>
                      {selectedEventPopover.taskType}
                    </span>
                  )}
                  {selectedEventPopover.priority && (
                    <span className="inline-flex items-center rounded-md bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                      {selectedEventPopover.priority}
                    </span>
                  )}
                </div>
                {selectedEventPopover.goalTitle && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium">Goal:</span> {selectedEventPopover.goalTitle}
                  </div>
                )}
                {(() => {
                  const statusConfig = TASK_STATUS_CONFIG[selectedEventPopover.status] ?? DEFAULT_TASK_STATUS;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusConfig.dot}`} />
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {statusConfig.label}
                      </span>
                    </div>
                  );
                })()}
              </>
            )}

          </div>

          {/* Popover Actions */}
          <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center gap-2">
            {/* Aim: Complete + Manage Tasks */}
            {selectedEventPopover.source === 'aims' && selectedEventPopover.status !== 'COMPLETED' && (
              <>
                <button
                  onClick={() => selectedEventPopover.aimInstanceId && handleCompleteAim(selectedEventPopover.aimInstanceId)}
                  disabled={completingEvent}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {completingEvent ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Complete
                </button>
                <button
                  onClick={handlePopoverOpenTasks}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  Tasks
                </button>
              </>
            )}
            {selectedEventPopover.source === 'aims' && selectedEventPopover.status === 'COMPLETED' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Already completed
              </div>
            )}

            {/* Task: Complete */}
            {selectedEventPopover.source === 'task' && selectedEventPopover.status !== 'DONE' && (
              <button
                onClick={() => selectedEventPopover.taskId && handleCompleteTask(selectedEventPopover.taskId)}
                disabled={completingEvent}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {completingEvent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Complete
              </button>
            )}
            {selectedEventPopover.source === 'task' && selectedEventPopover.status === 'DONE' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Already done
              </div>
            )}

          </div>
        </div>
      )}

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
          eventClick={handleEventClick}
          select={onDateSelect}
          datesSet={handleDatesSet}
          height="auto"
          nowIndicator={true}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          eventDidMount={(info) => {
            const props = info.event.extendedProps || {};
            // Show pin icon on pinned events
            if (props.isPinned) {
              const pinEl = document.createElement('span');
              pinEl.textContent = '\u{1F4CC}';
              pinEl.style.cssText = 'position:absolute;top:2px;right:4px;font-size:10px;';
              info.el.style.position = 'relative';
              info.el.appendChild(pinEl);
            }
            // Show task count badge on aim events with assigned tasks
            if (props.aimInstanceId && props.tasks && props.tasks.length > 0) {
              const badge = document.createElement('span');
              const doneCount = props.tasks.filter((t: AimTask) => t.status === 'DONE').length;
              badge.textContent = `${doneCount}/${props.tasks.length}`;
              badge.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:9px;background:rgba(0,0,0,0.4);color:#fff;border-radius:4px;padding:0 4px;line-height:1.4;';
              info.el.style.position = 'relative';
              info.el.appendChild(badge);
            }
          }}
        />
      </div>

      {/* Task Assignment Panel (overlay for Deep Work container) */}
      {showTaskAssignment && selectedAimInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="glass-panel w-full max-w-md mx-4 rounded-xl border border-[var(--border-color)] shadow-2xl"
            style={{ maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-teal-400" />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedAimInstance.title}
                </h3>
              </div>
              <button
                onClick={handleCloseTaskAssignment}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
              {/* Currently assigned tasks */}
              {selectedAimInstance.tasks.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                    Assigned Tasks
                  </p>
                  <ul className="space-y-1">
                    {selectedAimInstance.tasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          task.status === 'DONE' ? 'bg-emerald-400' : task.status === 'IN_PROGRESS' ? 'bg-blue-400' : 'bg-gray-400'
                        }`} />
                        <span className={task.status === 'DONE' ? 'line-through opacity-60' : ''}>
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Available tasks to assign */}
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Select Tasks for This Block
                </p>
                {availableTodoTasks.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] italic">No unscheduled tasks available.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {availableTodoTasks.map((task: any) => {
                      const taskId = task.taskId || task.id?.replace('task-', '') || task.id;
                      const isSelected = selectedTaskIds.has(taskId);
                      return (
                        <li key={taskId}>
                          <label
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-500/15 border border-teal-500/30'
                                : 'hover:bg-[var(--surface-raised)] border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTaskSelection(taskId)}
                              className="rounded border-[var(--border-color)] text-teal-500 focus:ring-teal-500/30 h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-[var(--text-primary)] block truncate">{task.title}</span>
                              {task.goalTitle && (
                                <span className="text-xs text-[var(--text-muted)] block truncate">{task.goalTitle}</span>
                              )}
                            </div>
                            {task.estimatedMinutes && (
                              <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                {task.estimatedMinutes}m
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Footer with save button */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)]">
              <span className="text-xs text-[var(--text-muted)]">
                {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleSaveTaskAssignment}
                disabled={savingTasks}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {savingTasks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
