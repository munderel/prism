'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg, DatesSetArg, EventDropArg } from '@fullcalendar/core';
import type { EventReceiveArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { WorkBlockStatus } from '@prisma/client';
import { type ProposedSlot } from '@/lib/scheduling-engine';
import { Check, X, ListTodo, Save, Loader2, CheckCircle2, Pencil, CalendarX2, Trash2, RotateCcw } from 'lucide-react';
import { ActivitySelectModal } from './ActivitySelectModal';
import { WorkBlockObjectiveModal, type WorkBlockObjectiveInput, type WorkBlockObjectivePayload } from './WorkBlockObjectiveModal';
import { fetchTaskWorkBlockHints } from '@/lib/work-blocks-client';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { EventGoalsPopover } from '@/components/scheduled-item-goals/EventGoalsPopover';
import { Popover, PopoverBody, PopoverClose, PopoverFooter, PopoverHeader } from '@/components/ui/Popover';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PRISM_COLORS } from '@/lib/prism-colors';
import { scheduleCalendarEvent, scheduleItemById } from './scheduleEvent';

interface SelectedEventPopover {
  eventId: string;
  title: string;
  source: 'aims' | 'task' | 'review' | 'powerdown' | 'meeting' | 'process' | 'google';
  status: string;
  anchorRect: DOMRect;
  // Aim-specific
  aimInstanceId?: string;
  aimCategoryName?: string;
  selectedActivity?: string;
  // Task-specific
  taskId?: string;
  taskType?: string;
  priority?: string;
  goalTitle?: string;
  // Work-block-specific (set when eventId starts with 'workblock-')
  workBlockId?: string;
  workBlockCompletionStatus?: WorkBlockStatus;
  // Review/powerdown/process/google (meetings no longer use the popover —
  // they route directly to /meetings/[id]/edit).
  link?: string;
  description?: string;
  // Process-specific
  processId?: string;
  scheduledDate?: string;
  // Google Calendar event
  gcalEventId?: string;
  gcalCalendarId?: string;
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

/** Shape of the event data objects returned by useCalendarEvents */
interface CalendarEventData {
  id: string;
  title: string;
  start: string;
  end: string;
  source: string;
  status?: string;
  aimInstanceId?: string;
  aimCategoryName?: string;
  tasks?: AimTask[];
  taskId?: string;
  taskType?: string;
  itemType?: string;
  [key: string]: unknown;
}

/** Shape of unscheduled task items passed via props */
interface UnscheduledTaskItem {
  id: string;
  itemType?: string;
  title: string;
  status?: string;
  taskId?: string;
  duration?: number;
  taskType?: string;
  priority?: string;
  aimInstanceId?: string;
  aimCategoryId?: string;
  goalTitle?: string;
  estimatedMinutes?: number;
  [key: string]: unknown;
}

interface CalendarViewProps {
  onEventClick?: (info: EventClickArg) => void;
  onDateSelect?: (info: DateSelectArg) => void;
  onExternalDrop?: (itemId: string, start: Date, end: Date, itemType?: string) => void;
  unscheduledTasks?: UnscheduledTaskItem[];
  onBatchScheduleConfirm?: (slots: Array<{ id: string; timeBlockStart: string; timeBlockEnd: string; isAutoScheduled: boolean; isPinned: boolean; itemType?: string }>) => void;
  scheduleSettings?: {
    workingHoursStart: string;
    workingHoursEnd: string;
    casualHoursStart: string;
    casualHoursEnd: string;
    taskSchedulePeriod: string;
  };
  /** ISO datetime string — when set, calendar navigates to this date and scrolls to the time */
  navigateTo?: string;
}

// Source filters pull their dot color from PRISM_COLORS so the filter chip
// and the actual events on the grid always match. Keep "tasks" generic
// (indigo / Improve) since tasks span multiple sub-types rendered with their
// own PRISM_COLORS entry per-event.
const SOURCE_FILTERS: Array<{ key: string; label: string; colorHex: string }> = [
  { key: 'tasks', label: 'My Tasks', colorHex: PRISM_COLORS.IMPROVE.color },
  { key: 'reviews', label: 'Reviews', colorHex: PRISM_COLORS.REVIEW.color },
  { key: 'meetings', label: 'Meetings', colorHex: PRISM_COLORS.MEETING.color },
  { key: 'aims', label: 'Aims', colorHex: PRISM_COLORS.AIM.color },
  { key: 'google', label: 'Google Calendar', colorHex: PRISM_COLORS.GOOGLE_CAL.color },
  { key: 'powerdown', label: 'Power Down', colorHex: PRISM_COLORS.POWER_DOWN.color },
  { key: 'processes', label: 'Processes', colorHex: PRISM_COLORS.MAINTENANCE.color },
  { key: 'food', label: 'Food', colorHex: PRISM_COLORS.FOOD.color },
];

// Task-type badge styles derived from PRISM_COLORS so subtype chips in the
// calendar event popover match the grid event colors.
const TASK_TYPE_BADGE_STYLES: Record<string, string> = {
  IMPROVE: `${PRISM_COLORS.IMPROVE.bgClass} ${PRISM_COLORS.IMPROVE.textClass}`,
  REACT: `${PRISM_COLORS.REACT.bgClass} ${PRISM_COLORS.REACT.textClass}`,
  MAINTENANCE: `${PRISM_COLORS.MAINTENANCE.bgClass} ${PRISM_COLORS.MAINTENANCE.textClass}`,
};

const TASK_STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  DONE: { dot: 'bg-emerald-400', label: 'Done' },
  IN_PROGRESS: { dot: 'bg-blue-400', label: 'In Progress' },
};

const DEFAULT_TASK_STATUS = { dot: 'bg-gray-400', label: 'To Do' };

export function CalendarView({ onEventClick, onDateSelect, onExternalDrop, unscheduledTasks, onBatchScheduleConfirm, scheduleSettings: _scheduleSettings, navigateTo }: CalendarViewProps) {
  const router = useRouter();
  const toast = useToast();
  const calendarRef = useRef<FullCalendar>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const { events, error: calendarError, refreshEvents, googleStatus, googleError, isLoading: _calendarLoading } = useCalendarEvents(dateRange?.start ?? null, dateRange?.end ?? null);
  const { resolvedTheme } = useTheme();
  const isMobile = useMediaQuery('(max-width: 1023px)');

  // FullCalendar only reads initialView once at mount (when isMobile is still false).
  // Imperatively switch view after isMobile resolves so mobile gets day view.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(isMobile ? 'timeGridDay' : 'timeGridWeek');
  }, [isMobile]);

  // Navigate calendar to a specific date/time (e.g. after mobile scheduling)
  useEffect(() => {
    if (!navigateTo) return;
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const d = new Date(navigateTo);
    api.gotoDate(d);
    api.scrollToTime({ hours: d.getHours(), minutes: Math.max(0, d.getMinutes() - 15) });
    refreshEvents();
  }, [navigateTo, refreshEvents]);

  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'aims', 'google', 'powerdown', 'processes', 'food']));
  const [ghostEvents, setGhostEvents] = useState<ProposedSlot[]>([]);
  const [showGhosts, setShowGhosts] = useState(false);

  // Event detail popover state
  const [selectedEventPopover, setSelectedEventPopover] = useState<SelectedEventPopover | null>(null);
  const [completingEvent, setCompletingEvent] = useState(false);

  // Activity selection modal state
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [pendingAimDrop, setPendingAimDrop] = useState<{ info: EventReceiveArg; startISO: string; endISO: string } | null>(null);
  const [pendingActivities, setPendingActivities] = useState<string[]>([]);
  const [pendingAimName, setPendingAimName] = useState('');

  // Task editor modal state
  const [editingTask, setEditingTask] = useState<Record<string, unknown> | null>(null);

  // Work-block objective modal state (opens when a task is dropped on calendar).
  // `pendingTempEventId` is the FullCalendar event id created by the drop; we remove it if user cancels.
  const { data: userSettingsData } = useUserSettings();
  const defaultWorkBlockMinutes =
    typeof userSettingsData?.defaultWorkBlockMinutes === 'number'
      ? (userSettingsData.defaultWorkBlockMinutes as number)
      : 30;
  const [workBlockModalInput, setWorkBlockModalInput] = useState<WorkBlockObjectiveInput | null>(null);
  const [pendingWorkBlockInfo, setPendingWorkBlockInfo] = useState<EventReceiveArg | null>(null);

  // Task assignment panel state (Deep Work as task container)
  const [selectedAimInstance, setSelectedAimInstance] = useState<SelectedAimInstance | null>(null);
  const [showTaskAssignment, setShowTaskAssignment] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [savingTasks, setSavingTasks] = useState(false);

  const handleDatesSet = (info: DatesSetArg) => {
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
        const data = await res.json().catch(() => ({}));
        toast.success(`${label} completed!`);
        if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
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

  const handleToggleWorkBlockComplete = useCallback(
    async (workBlockId: string, currentStatus: string | undefined) => {
      const next = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
      setCompletingEvent(true);
      try {
        const res = await fetch(`/api/work-blocks/${workBlockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completionStatus: next }),
        });
        if (res.ok) {
          toast.success(next === 'COMPLETED' ? 'Block completed' : 'Block reopened');
          setSelectedEventPopover(null);
          refreshEvents();
        } else {
          toast.error('Failed to update block');
        }
      } catch {
        toast.error('Failed to update block');
      } finally {
        setCompletingEvent(false);
      }
    },
    [toast, refreshEvents],
  );

  // --- Unschedule handler (clear timeBlockStart/End) ---
  const handleUnschedule = useCallback(async (
    endpoint: string,
    label: string,
  ) => {
    setCompletingEvent(true);
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
      });
      if (res.ok) {
        toast.success(`${label} unscheduled`);
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error(`Failed to unschedule ${label.toLowerCase()}`);
      }
    } catch {
      toast.error(`Failed to unschedule ${label.toLowerCase()}`);
    } finally {
      setCompletingEvent(false);
    }
  }, [toast, refreshEvents]);

  // --- Unschedule process occurrence (creates task + marks execution unscheduled) ---
  const handleUnscheduleProcess = useCallback(async (processId: string, scheduledDate: string) => {
    setCompletingEvent(true);
    try {
      const res = await fetch(`/api/processes/${processId}/unschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate }),
      });
      if (res.ok) {
        toast.success('Process occurrence unscheduled');
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error('Failed to unschedule process');
      }
    } catch {
      toast.error('Failed to unschedule process');
    } finally {
      setCompletingEvent(false);
    }
  }, [toast, refreshEvents]);

  // --- Delete handlers ---
  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Task deleted');
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error('Failed to delete task');
      }
    } catch {
      toast.error('Failed to delete task');
    }
  }, [toast, refreshEvents]);

  const handleDeleteAim = useCallback(async (aimInstanceId: string) => {
    try {
      const res = await fetch(`/api/aims/instances/${aimInstanceId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Aim removed');
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error('Failed to delete aim');
      }
    } catch {
      toast.error('Failed to delete aim');
    }
  }, [toast, refreshEvents]);

  const handleDeleteGoogleEvent = useCallback(async (gcalEventId: string, calendarId: string) => {
    try {
      const res = await fetch(`/api/calendar/events/${gcalEventId}?calendarId=${encodeURIComponent(calendarId)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Event deleted from Google Calendar');
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error('Failed to delete Google Calendar event');
      }
    } catch {
      toast.error('Failed to delete Google Calendar event');
    }
  }, [toast, refreshEvents]);

  // --- Task assignment handlers ---
  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps || {};
    const rect = info.el.getBoundingClientRect();

    // Powerdown event → show popover with Start action
    if (props.link === '/powerdown' || info.event.id?.startsWith('powerdown-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'powerdown',
        status: '',
        anchorRect: rect,
        link: '/powerdown',
      });
      return;
    }

    // Review events → show popover with Start + Settings actions
    if (info.event.id?.startsWith('weekly-review-') || info.event.id?.startsWith('monthly-review-') || info.event.id?.startsWith('yearly-review-') || info.event.id?.startsWith('team-review-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'review',
        status: '',
        anchorRect: rect,
        link: props.link || '/reviews',
      });
      return;
    }

    // Stored review event → show popover
    if (info.event.id?.startsWith('review-')) {
      const reviewId = props.reviewId;
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'review',
        status: props.completed ? 'completed' : '',
        anchorRect: rect,
        link: reviewId ? `/reviews/${reviewId}/complete` : '/reviews',
      });
      return;
    }

    // Process event → show popover
    if (info.event.id?.startsWith('process-')) {
      const match = info.event.id.match(/^process-(.+)-(\d{4}-\d{2}-\d{2})$/);
      const processId = match ? match[1] : '';
      const scheduledDate = match ? match[2] : '';
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'process',
        status: props.completed ? 'completed' : '',
        anchorRect: rect,
        link: '/processes',
        processId,
        scheduledDate,
      });
      return;
    }

    // Meeting event → focused edit page (Component 6). Popover bypassed so
    // every calendar surface routes to one canonical destination.
    if (info.event.id?.startsWith('meeting-')) {
      const meetingId = info.event.id.replace('meeting-', '');
      router.push(`/meetings/${meetingId}/edit`);
      return;
    }

    // If this is an aim event, show popover with Complete action
    if (props.aimInstanceId) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'aims',
        status: props.status || 'SCHEDULED',
        anchorRect: rect,
        aimInstanceId: props.aimInstanceId,
        aimCategoryName: props.aimCategoryName,
        selectedActivity: props.selectedActivity,
      });
      return;
    }

    // Task event — route to the dedicated edit page (Component 13).
    // WorkBlock events (workblock- prefix) are handled below (Component 14).
    if ((props.taskId && !props.workBlockId && !info.event.id?.startsWith('workblock-')) || info.event.id?.startsWith('task-')) {
      const taskId = props.taskId || info.event.id?.replace('task-', '');
      if (taskId) {
        router.push(`/tasks/${taskId}/edit`);
        return;
      }
    }

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

    // Google Calendar event → show popover with description + delete
    if (info.event.id?.startsWith('google-')) {
      const rawId = info.event.id.replace('google-', '');
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'google',
        status: '',
        anchorRect: rect,
        description: props.description,
        gcalEventId: rawId,
        gcalCalendarId: props.calendarId || 'primary',
        link: props.meetLink,
      });
      return;
    }

    // Otherwise, delegate to parent handler
    onEventClick?.(info);
  };

  const handlePopoverOpenTasks = () => {
    if (!selectedEventPopover || selectedEventPopover.source !== 'aims') return;
    // Open the task assignment panel for this aim
    const aimEvent = events.find((e: CalendarEventData) => e.aimInstanceId === selectedEventPopover.aimInstanceId);
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
  const handleEventReceive = async (info: EventReceiveArg) => {
    const props = info.event.extendedProps || {};
    const itemType = (props.itemType as string) || 'task';
    const start = info.event.start!;
    const fallbackMs = ((props.durationMin as number) ?? 60) * 60 * 1000;
    const end = info.event.end || new Date(start.getTime() + fallbackMs);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    try {
      if (itemType === 'aim') {
        const aimInstanceId = props.aimInstanceId as string | undefined;
        const aimCategoryId = props.aimCategoryId as string | undefined;

        // Check if this aim has activities that need selection
        let activities: string[] = [];
        try {
          const activitiesRaw = props.activities as string | undefined;
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
          await scheduleItemById('aim', aimInstanceId, start, end);
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
      } else if (itemType === 'food') {
        const title = info.event.title || 'Meal';
        const res = await fetch('/api/food-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, startAt: startISO, endAt: endISO }),
        });
        if (!res.ok) throw new Error('Failed to create food block');
        refreshEvents();
      } else {
        const taskId = (props.taskId as string) || info.event.id?.replace('task-', '');
        if (!taskId) return;

        // Compute proposed block size: min(defaultWorkBlockMinutes, remaining estimate)
        const hints = await fetchTaskWorkBlockHints(taskId);
        const estimated = hints.estimatedMinutes ?? 60;
        const remaining = Math.max(0, estimated - hints.scheduledMinutes);
        const proposedMinutes = remaining === 0
          ? defaultWorkBlockMinutes
          : Math.min(defaultWorkBlockMinutes, remaining);

        // Always open the naming modal on drag-create so every workblock gets a
        // deliberate name and a chance to carry over task-level clear goals.
        setWorkBlockModalInput({
          taskId,
          taskTitle: info.event.title,
          taskDeliverable: hints.deliverable,
          start,
          end: new Date(start.getTime() + proposedMinutes * 60000),
          proposedMinutes,
          taskLevelClearGoals: hints.clearGoals,
        });
        setPendingWorkBlockInfo(info);
      }
    } catch {
      info.event.remove();
      toast.error('Failed to schedule item. Please try again.');
    }
  };

  const handleWorkBlockModalSave = useCallback(async (payload: WorkBlockObjectivePayload) => {
    if (!workBlockModalInput) return;
    const res = await fetch('/api/work-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: workBlockModalInput.taskId,
        start: payload.start,
        end: payload.end,
        mainObjective: payload.mainObjective,
        clearGoals: payload.clearGoals,
      }),
    });
    if (!res.ok) {
      throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create work block');
    }
    // Remove the temporary FullCalendar event; the refresh will pull the real workblock event back in.
    if (pendingWorkBlockInfo) pendingWorkBlockInfo.event.remove();
    setPendingWorkBlockInfo(null);
    setWorkBlockModalInput(null);
    refreshEvents();
  }, [workBlockModalInput, pendingWorkBlockInfo, refreshEvents]);

  const handleWorkBlockModalCancel = useCallback(() => {
    if (pendingWorkBlockInfo) pendingWorkBlockInfo.event.remove();
    setPendingWorkBlockInfo(null);
    setWorkBlockModalInput(null);
  }, [pendingWorkBlockInfo]);

  const handleDeleteWorkBlock = useCallback(async (workBlockId: string) => {
    try {
      const res = await fetch(`/api/work-blocks/${workBlockId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Work block removed');
        setSelectedEventPopover(null);
        refreshEvents();
      } else {
        toast.error('Failed to delete work block');
      }
    } catch {
      toast.error('Failed to delete work block');
    }
  }, [toast, refreshEvents]);

  const handleEventDrop = async (info: EventDropArg | EventResizeDoneArg) => {
    const eventId = info.event.id;
    const startDate = info.event.start;
    const endDate = info.event.end;
    if (!startDate || !endDate) {
      info.revert();
      return;
    }
    const newStart = startDate.toISOString();
    const newEnd = endDate.toISOString();

    // Optimistically update the SWR cache so any re-render during the API call
    // shows the new times instead of snapping back to old positions.
    refreshEvents(
      (currentData: CalendarEventData[] | { events: CalendarEventData[] } | undefined) => {
        if (!currentData) return currentData;
        const eventsList = Array.isArray(currentData) ? currentData : (currentData?.events ?? []);
        const updatedEvents = eventsList.map((e: CalendarEventData) =>
          e.id === eventId ? { ...e, start: newStart, end: newEnd } : e
        );
        return Array.isArray(currentData) ? updatedEvents : { ...currentData, events: updatedEvents };
      },
      { revalidate: false }
    );

    try {
      // Task drags on this calendar default to pinned + dueDate-aligned.
      const taskExtras = eventId.startsWith('task-')
        ? { dueDate: newStart, isPinned: true }
        : undefined;
      await scheduleCalendarEvent(info.event, startDate, endDate, taskExtras);
      console.info('[calendar] drop success', { eventId, newStart, newEnd });
      // Defer the authoritative refetch. Google takes ~1s to replicate PATCHes
      // across read replicas, so an immediate revalidate can return pre-move
      // data and clobber our optimistic cache. The background revalidation
      // below reconciles once Google has caught up.
      setTimeout(() => {
        refreshEvents()
          .then((data) => {
            // Diagnostic: help confirm work-block snap-back hypothesis. Dump
            // the refetched event's times so we can see if the aggregator is
            // returning the moved block at its new position, the old one, or
            // not at all. Remove once the work-block cause is locked down.
            const list = Array.isArray(data) ? data : data?.events ?? [];
            const found = list.find((e: CalendarEventData) => e.id === eventId);
            console.info('[calendar] post-refetch state', {
              eventId,
              expectedStart: newStart,
              expectedEnd: newEnd,
              foundInList: !!found,
              actualStart: found?.start,
              actualEnd: found?.end,
            });
          })
          .catch(() => {});
      }, 2000);
    } catch (err) {
      console.error('[calendar] drop failed', { eventId, newStart, newEnd, err });
      info.revert();
      const message =
        err && typeof err === 'object' && 'userMessage' in err && typeof (err as { userMessage: unknown }).userMessage === 'string'
          ? (err as { userMessage: string }).userMessage
          : 'Failed to update event. Please try again.';
      toast.error(message);
      await refreshEvents();
    }
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
          return scheduleItemById('aim', aimInstanceId, ghost.start, ghost.end);
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
        return scheduleItemById('task', taskId, ghost.start, ghost.end, {
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
    const aimInstanceId = props.aimInstanceId as string | undefined;
    const aimCategoryId = props.aimCategoryId as string | undefined;

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

    const start = info.event.start!;
    const fallbackMs = ((props.durationMin as number) ?? 60) * 60 * 1000;
    const end = info.event.end || new Date(start.getTime() + fallbackMs);

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
    (t: UnscheduledTaskItem) => t.itemType !== 'aim' && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
  );

  const filteredEvents = events.filter((e: CalendarEventData) => activeFilters.has(e.source));

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
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {SOURCE_FILTERS.map(({ key, label, colorHex }) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            title={label}
            className={`flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilters.has(key)
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-color)]'
                : 'text-[var(--text-muted)] border border-[var(--surface-raised)] opacity-50'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorHex }} />
            <span className="hidden sm:inline">{label}</span>
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

      {/* Work Block objective modal (fired when user drops a task on calendar) */}
      <WorkBlockObjectiveModal
        open={!!workBlockModalInput}
        input={workBlockModalInput}
        onSave={handleWorkBlockModalSave}
        onCancel={handleWorkBlockModalCancel}
      />

      {/* Event Detail Popover */}
      {selectedEventPopover && (() => {
        const closePopover = () => setSelectedEventPopover(null);
        const popoverInner = (
          <>
            <PopoverHeader>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate pr-2">
                {selectedEventPopover.title}
              </h4>
              <PopoverClose onClose={closePopover} />
            </PopoverHeader>

            <PopoverBody>
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
                {selectedEventPopover.aimInstanceId && (
                  <EventGoalsPopover
                    source="aims"
                    aimInstanceId={selectedEventPopover.aimInstanceId}
                    onChange={refreshEvents}
                  />
                )}
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
                {selectedEventPopover.description && (
                  <div className="text-xs text-[var(--text-secondary)] line-clamp-3 mt-1">
                    {selectedEventPopover.description}
                  </div>
                )}
                {selectedEventPopover.taskId && (
                  <EventGoalsPopover
                    source={selectedEventPopover.source}
                    workBlockId={selectedEventPopover.workBlockId}
                    taskId={selectedEventPopover.taskId}
                    taskTitle={selectedEventPopover.title}
                    taskType={selectedEventPopover.taskType}
                    onChange={refreshEvents}
                  />
                )}
              </>
            )}

            {/* GOOGLE EVENT popover */}
            {selectedEventPopover.source === 'google' && (
              <>
                {selectedEventPopover.description && (
                  <div className="text-xs text-[var(--text-secondary)] line-clamp-4">
                    {selectedEventPopover.description}
                  </div>
                )}
                {selectedEventPopover.link && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium">Meet:</span>{' '}
                    <a href={selectedEventPopover.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      Join
                    </a>
                  </div>
                )}
              </>
            )}

            {/* REVIEW / POWERDOWN / PROCESS popover */}
            {(selectedEventPopover.source === 'review' || selectedEventPopover.source === 'powerdown' || selectedEventPopover.source === 'process') && (
              <div className="text-xs text-[var(--text-muted)]">
                {selectedEventPopover.source === 'review' && 'Scheduled review session'}
                {selectedEventPopover.source === 'powerdown' && 'Daily shutdown ritual'}
                {selectedEventPopover.source === 'process' && 'Recurring process'}
              </div>
            )}

            </PopoverBody>

            <PopoverFooter>
            {/* Aim actions */}
            {selectedEventPopover.source === 'aims' && selectedEventPopover.status !== 'COMPLETED' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedEventPopover.aimInstanceId && handleCompleteAim(selectedEventPopover.aimInstanceId)}
                  disabled={completingEvent}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {completingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Complete
                </button>
                <button
                  onClick={handlePopoverOpenTasks}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  Tasks
                </button>
              </div>
            )}
            {selectedEventPopover.source === 'aims' && selectedEventPopover.status === 'COMPLETED' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Already completed
              </div>
            )}
            {selectedEventPopover.source === 'aims' && selectedEventPopover.aimInstanceId && (
              <>
                <button
                  onClick={() => handleUnschedule(`/api/aims/instances/${selectedEventPopover.aimInstanceId}`, 'Aim')}
                  disabled={completingEvent}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  <CalendarX2 className="h-3.5 w-3.5" />
                  Unschedule
                </button>
                <button
                  onClick={() => selectedEventPopover.aimInstanceId && handleDeleteAim(selectedEventPopover.aimInstanceId)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            )}

            {/* Task actions */}
            {selectedEventPopover.source === 'task' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const taskId = selectedEventPopover.taskId;
                    if (!taskId) return;
                    try {
                      const res = await fetch(`/api/tasks/${taskId}`);
                      if (res.ok) {
                        const task = await res.json();
                        setEditingTask(task);
                        setSelectedEventPopover(null);
                      }
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                {selectedEventPopover.workBlockId ? (
                  selectedEventPopover.workBlockCompletionStatus === 'COMPLETED' ? (
                    <button
                      onClick={() => selectedEventPopover.workBlockId && handleToggleWorkBlockComplete(
                        selectedEventPopover.workBlockId,
                        selectedEventPopover.workBlockCompletionStatus,
                      )}
                      disabled={completingEvent}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-50 transition-colors"
                    >
                      {completingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Mark incomplete
                    </button>
                  ) : (
                    <button
                      onClick={() => selectedEventPopover.workBlockId && handleToggleWorkBlockComplete(
                        selectedEventPopover.workBlockId,
                        selectedEventPopover.workBlockCompletionStatus,
                      )}
                      disabled={completingEvent}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {completingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Complete block
                    </button>
                  )
                ) : (
                  <>
                    {selectedEventPopover.status !== 'DONE' && (
                      <button
                        onClick={() => selectedEventPopover.taskId && handleCompleteTask(selectedEventPopover.taskId)}
                        disabled={completingEvent}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {completingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Complete
                      </button>
                    )}
                    {selectedEventPopover.status === 'DONE' && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {selectedEventPopover.source === 'task' && selectedEventPopover.taskId && (
              <>
                {selectedEventPopover.eventId?.startsWith('workblock-') ? (
                  <button
                    onClick={() => {
                      const wbId = selectedEventPopover.eventId.replace('workblock-', '');
                      handleDeleteWorkBlock(wbId);
                    }}
                    disabled={completingEvent}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Remove block
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnschedule(`/api/tasks/${selectedEventPopover.taskId}`, 'Task')}
                    disabled={completingEvent}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Unschedule
                  </button>
                )}
                <button
                  onClick={() => {
                    const taskId = selectedEventPopover.taskId;
                    if (!taskId) return;
                    if (!window.confirm('Delete this task? This cannot be undone.')) return;
                    handleDeleteTask(taskId);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete task
                </button>
              </>
            )}

            {/* Review / Powerdown: Start + Settings */}
            {(selectedEventPopover.source === 'review' || selectedEventPopover.source === 'powerdown') && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    router.push(selectedEventPopover.link || (selectedEventPopover.source === 'review' ? '/reviews' : '/powerdown'));
                    setSelectedEventPopover(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                  Start
                </button>
                <button
                  onClick={() => {
                    router.push('/settings');
                    setSelectedEventPopover(null);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
                >
                  Settings
                </button>
              </div>
            )}

            {/* Process: Unschedule + Open */}
            {selectedEventPopover.source === 'process' && (
              <>
                {selectedEventPopover.processId && selectedEventPopover.scheduledDate && selectedEventPopover.status !== 'completed' && (
                  <button
                    onClick={() => handleUnscheduleProcess(
                      selectedEventPopover.processId!,
                      selectedEventPopover.scheduledDate!,
                    )}
                    disabled={completingEvent}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Reschedule
                  </button>
                )}
                <button
                  onClick={() => {
                    router.push('/processes');
                    setSelectedEventPopover(null);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                  Open
                </button>
              </>
            )}

            {/* Google event actions */}
            {selectedEventPopover.source === 'google' && (
              <>
                {selectedEventPopover.link && (
                  <a
                    href={selectedEventPopover.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                  >
                    Join Meeting
                  </a>
                )}
                <button
                  onClick={() => selectedEventPopover.gcalEventId && handleDeleteGoogleEvent(
                    selectedEventPopover.gcalEventId,
                    selectedEventPopover.gcalCalendarId || 'primary'
                  )}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete from Google Calendar
                </button>
              </>
            )}

            </PopoverFooter>
          </>
        );

        if (isMobile) {
          return (
            <>
              <div className="fixed inset-0 z-[59] bg-black/40" onClick={closePopover} />
              <div className="fixed inset-x-0 bottom-0 z-[60] w-full flex flex-col rounded-t-xl border-t border-[var(--border-color)] bg-[var(--background)] shadow-2xl backdrop-blur-sm pb-6 max-h-[85vh]">
                {popoverInner}
              </div>
            </>
          );
        }

        return (
          <Popover
            open
            anchorRect={selectedEventPopover.anchorRect}
            onClose={closePopover}
            className="w-72"
          >
            {popoverInner}
          </Popover>
        );
      })()}

      {/* Calendar */}
      <div className={`${resolvedTheme === 'dark' ? 'fc-dark-theme' : 'fc-light-theme'} glass-panel p-2 sm:p-4`}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={isMobile ? {
            left: 'prev,next',
            center: 'title',
            right: 'timeGridDay,timeGridWeek',
          } : {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={allDisplayEvents}
          editable={true}
          selectable={true}
          selectLongPressDelay={isMobile ? 1000 : 0}
          longPressDelay={isMobile ? 1000 : 0}
          droppable={true}
          eventDrop={handleEventDrop}
          eventResize={async (info: EventResizeDoneArg) => {
            if (!info.event.end) { info.revert(); return; }
            await handleEventDrop(info);
          }}
          eventReceive={handleEventReceive}
          eventClick={handleEventClick}
          select={onDateSelect}
          datesSet={handleDatesSet}
          height="auto"
          nowIndicator={true}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00:00"
          snapDuration="00:05:00"
          eventDidMount={(info) => {
            const props = info.event.extendedProps || {};
            // Dim and strike-through DONE/DROPPED task events
            if (props.status === 'DONE' || props.status === 'DROPPED') {
              info.el.style.opacity = '0.45';
              const titleEl = info.el.querySelector('.fc-event-title') as HTMLElement | null;
              if (titleEl) titleEl.style.textDecoration = 'line-through';
            }
            // Distinguish work-block completion outcomes visually.
            if (props.itemType === 'workblock') {
              if (props.completionStatus === 'COMPLETED') {
                info.el.style.opacity = '0.55';
                const titleEl = info.el.querySelector('.fc-event-title') as HTMLElement | null;
                if (titleEl) titleEl.style.textDecoration = 'line-through';
              } else if (props.completionStatus === 'MISSED') {
                info.el.style.opacity = '0.4';
                info.el.style.border = '1px dashed rgba(244, 63, 94, 0.8)'; // rose-500
                info.el.style.backgroundColor = 'rgba(244, 63, 94, 0.15)';
              } else if (props.completionStatus === 'PARTIAL') {
                info.el.style.opacity = '0.7';
                info.el.style.border = '1px dashed rgba(245, 158, 11, 0.8)'; // amber-500
              }
            }
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
                    {availableTodoTasks.map((task: UnscheduledTaskItem) => {
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

      {/* Task Editor Modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={() => {
            setEditingTask(null);
            refreshEvents();
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
