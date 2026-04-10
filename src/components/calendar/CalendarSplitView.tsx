'use client';

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type { EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import type { EventReceiveArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import { ChevronDown, ChevronUp, X, Loader2, CheckCircle2, Pencil, CalendarX2, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useToast } from '@/components/ui/ToastProvider';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { PRISM_COLORS, WEEKLY_HOUR_TARGET, WEEKLY_HOUR_WARNING } from '@/lib/prism-colors';
import type { ColorDef } from '@/lib/prism-colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnscheduledItem {
  id: string;
  itemType: 'task' | 'aim' | 'review';
  title: string;
  duration: number; // minutes
  taskType?: string; // IMPROVE, REACT, MAINTENANCE
  priority?: string; // URGENT, HIGH, MEDIUM, LOW
  aimCategoryId?: string;
  reviewType?: string;
}

export interface CalendarSplitViewProps {
  viewMode: 'day' | 'week';
  dateRange: { start: string; end: string }; // ISO date strings
  unscheduledItems: UnscheduledItem[];
  onSchedule: (itemId: string, itemType: string, start: Date, end: Date) => void | Promise<void>;
  onUnschedule: (itemId: string, itemType: string) => void | Promise<void>;
  onRefresh?: () => void;
  showAimGrouping?: boolean;
  mode?: 'work_blocks' | 'schedule_tasks';
  onCreateWorkBlock?: (start: Date, end: Date, title?: string) => void | Promise<void>;
  /** Duration in minutes for the Deep Work (AIM Block) template. Defaults to 60. */
  aimBlockDuration?: number;
  /** Show work block template cards at the bottom of the left panel (default mode only). */
  showWorkBlockTemplates?: boolean;
}

interface SelectedEventPopover {
  eventId: string;
  title: string;
  source: 'aims' | 'task' | 'review' | 'powerdown' | 'meeting' | 'process' | 'google';
  status: string;
  position: { top: number; left: number };
  aimInstanceId?: string;
  aimCategoryName?: string;
  selectedActivity?: string;
  taskId?: string;
  taskType?: string;
  priority?: string;
  goalTitle?: string;
  link?: string;
  description?: string;
  cadence?: string;
  createdBy?: string;
  gcalEventId?: string;
  gcalCalendarId?: string;
}

/** Shape of the event data objects returned by useCalendarEvents */
interface CalendarEventData {
  id: string;
  title: string;
  start: string;
  end: string;
  source: string;
  status?: string;
  itemId?: string;
  itemType?: string;
  aimInstanceId?: string;
  aimCategoryName?: string;
  tasks?: { id: string; title: string; status: string }[];
  taskId?: string;
  taskType?: string;
  calendarId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ITEM_GROUPS: {
  key: string;
  label: string;
  emoji: string;
  filter: (item: UnscheduledItem) => boolean;
  colorKey: keyof typeof PRISM_COLORS;
}[] = [
  {
    key: 'improve',
    label: 'Improve Tasks',
    emoji: '\uD83C\uDFAF',
    filter: (i) => i.itemType === 'task' && i.taskType === 'IMPROVE',
    colorKey: 'IMPROVE',
  },
  {
    key: 'react',
    label: 'React Tasks',
    emoji: '\u26A1',
    filter: (i) => i.itemType === 'task' && i.taskType === 'REACT',
    colorKey: 'REACT',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    emoji: '\uD83D\uDD27',
    filter: (i) => i.itemType === 'task' && i.taskType === 'MAINTENANCE',
    colorKey: 'MAINTENANCE',
  },
  {
    key: 'aim',
    label: 'AIMs',
    emoji: '\uD83D\uDCAA',
    filter: (i) => i.itemType === 'aim',
    colorKey: 'AIM',
  },
  {
    key: 'review',
    label: 'Reviews',
    emoji: '\uD83D\uDCCB',
    filter: (i) => i.itemType === 'review',
    colorKey: 'REVIEW',
  },
];

const WORK_BLOCK_TEMPLATE_ID = '__work_block_template__';

const DEEP_WORK_TEMPLATE_ID = '__deep_work_template__';

function WorkBlockTemplateCard() {
  return (
    <div
      className="fc-event cursor-grab rounded-lg border px-3 py-2 mb-1.5 hover:shadow-md transition-shadow"
      style={{ backgroundColor: 'rgba(99,102,241,0.15)', borderColor: '#818cf8', borderWidth: '1px' }}
      data-event={JSON.stringify({
        id: WORK_BLOCK_TEMPLATE_ID,
        title: 'Normal Work Block',
        duration: { minutes: 60 },
        extendedProps: { itemId: WORK_BLOCK_TEMPLATE_ID, itemType: 'work_block_template' },
      })}
    >
      <span className="text-sm font-medium text-[var(--text-primary)]">Normal Work Block</span>
      <div className="mt-1 text-xs text-[var(--text-secondary)]">60m · reusable</div>
    </div>
  );
}

function DeepWorkTemplateCard({ duration }: { duration: number }) {
  return (
    <div
      className="fc-event cursor-grab rounded-lg border px-3 py-2 mb-1.5 hover:shadow-md transition-shadow"
      style={{ backgroundColor: 'rgba(20,184,166,0.15)', borderColor: '#14b8a6', borderWidth: '1px' }}
      data-event={JSON.stringify({
        id: DEEP_WORK_TEMPLATE_ID,
        title: 'Deep Work (AIM Block)',
        duration: { minutes: duration },
        extendedProps: { itemId: DEEP_WORK_TEMPLATE_ID, itemType: 'work_block_template' },
      })}
    >
      <span className="text-sm font-medium text-[var(--text-primary)]">Deep Work (AIM Block)</span>
      <div className="mt-1 text-xs text-[var(--text-secondary)]">{duration}m · reusable</div>
    </div>
  );
}

function priorityBadge(priority?: string) {
  if (!priority) return null;
  const styles: Record<string, string> = {
    URGENT: 'bg-red-500/15 text-red-400 border-red-500/40',
    HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
    LOW: 'bg-green-500/15 text-green-400 border-green-500/40',
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${styles[priority] ?? 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}
    >
      {priority}
    </span>
  );
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const DEFAULT_EVENT_COLOR_LIGHT = { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' };
const DEFAULT_EVENT_COLOR_DARK = { bg: '#e0e7ff', border: '#6366f1', text: '#a5b4fc' };

function colorFromDef(c: ColorDef, isDark: boolean) {
  return { bg: c.bg, border: c.border, text: isDark ? c.textDark : c.textLight };
}

function getEventColor(event: { extendedProps?: Record<string, unknown> }, isDark: boolean): { bg: string; border: string; text: string } {
  const props = event.extendedProps ?? {};

  if (props.source === 'google') {
    return colorFromDef(PRISM_COLORS.GOOGLE_CAL, isDark);
  }

  // Match by task type (IMPROVE, REACT, MAINTENANCE)
  const taskType = props.taskType as keyof typeof PRISM_COLORS | undefined;
  if (taskType && PRISM_COLORS[taskType]) {
    return colorFromDef(PRISM_COLORS[taskType], isDark);
  }

  // Match by item type (aim, review)
  const ITEM_TYPE_MAP: Record<string, keyof typeof PRISM_COLORS> = { aim: 'AIM', review: 'REVIEW' };
  const colorKey = ITEM_TYPE_MAP[props.itemType as string];
  if (colorKey) {
    return colorFromDef(PRISM_COLORS[colorKey], isDark);
  }

  // Match by event source (meetings, powerdown)
  const SOURCE_MAP: Record<string, keyof typeof PRISM_COLORS> = { meetings: 'MEETING', powerdown: 'POWER_DOWN' };
  const sourceKey = SOURCE_MAP[props.source as string];
  if (sourceKey) {
    return colorFromDef(PRISM_COLORS[sourceKey], isDark);
  }

  return isDark ? DEFAULT_EVENT_COLOR_DARK : DEFAULT_EVENT_COLOR_LIGHT;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UnscheduledCard({
  item,
  colorKey,
}: {
  item: UnscheduledItem;
  colorKey: keyof typeof PRISM_COLORS;
}) {
  const color = PRISM_COLORS[colorKey];

  return (
    <div
      className="fc-event cursor-grab rounded-lg border px-3 py-2 mb-1.5 transition-shadow hover:shadow-md"
      style={{
        backgroundColor: color?.bg ?? '#f1f5f9',
        borderColor: color?.border ?? '#94a3b8',
        borderWidth: '1px',
      }}
      data-event={JSON.stringify({
        id: item.id,
        title: item.title,
        duration: { minutes: item.duration },
        extendedProps: {
          itemId: item.id,
          itemType: item.itemType,
          taskType: item.taskType,
          reviewType: item.reviewType,
          aimCategoryId: item.aimCategoryId,
        },
      })}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)] leading-tight line-clamp-2">
          {item.title}
        </span>
        {priorityBadge(item.priority)}
      </div>
      <div className="mt-1 text-xs text-[var(--text-secondary)]">{formatDuration(item.duration)}</div>
    </div>
  );
}

function WeeklyHourBar({ scheduledMinutes }: { scheduledMinutes: number }) {
  const scheduledHours = scheduledMinutes / 60;
  const pct = Math.min((scheduledHours / WEEKLY_HOUR_TARGET) * 100, 100);

  let barColor = 'bg-red-500';
  if (scheduledHours >= WEEKLY_HOUR_TARGET) {
    barColor = 'bg-green-500';
  } else if (scheduledHours >= WEEKLY_HOUR_WARNING) {
    barColor = 'bg-yellow-500';
  }

  return (
    <div className="px-4 py-3 border-t border-[var(--border-color)] bg-[var(--surface-raised)]">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
        <span className="font-medium">Weekly Target</span>
        <span>
          {scheduledHours.toFixed(1)}h / {WEEKLY_HOUR_TARGET}h scheduled
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CalendarSplitView({
  viewMode,
  dateRange,
  unscheduledItems,
  onSchedule,
  onUnschedule,
  onRefresh,
  showAimGrouping: _showAimGrouping = false,
  mode,
  onCreateWorkBlock,
  aimBlockDuration = 60,
  showWorkBlockTemplates = false,
}: CalendarSplitViewProps) {
  const draggableContainerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const pendingWorkBlocks = useRef<any[]>([]);
  const pendingScheduledItems = useRef<any[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const toast = useToast();
  const router = useRouter();
  const [mobileItemsExpanded, setMobileItemsExpanded] = useState(false);
  const [selectedEventPopover, setSelectedEventPopover] = useState<SelectedEventPopover | null>(null);
  const [completingEvent, setCompletingEvent] = useState(false);
  const [editingTask, setEditingTask] = useState<Record<string, unknown> | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: string; end: string } | null>(null);

  // Match the main calendar's data flow: fetch the exact visible range
  // reported by FullCalendar instead of a parent-supplied approximation.
  const { events: calendarEvents, refreshEvents: mutateEvents } = useCalendarEvents(
    visibleRange?.start ?? null,
    visibleRange?.end ?? null,
  );

  // Merge pending work block placeholders with server events.
  // Placeholders are auto-removed once a matching server event appears (by time overlap).
  const displayEvents = useMemo(() => {
    const serverEvents = calendarEvents ?? [];
    const stillPendingScheduled = pendingScheduledItems.current.filter((pending) => {
      return !serverEvents.some((evt: CalendarEventData) => {
        const sameItem = evt.itemId === pending.itemId && evt.itemType === pending.itemType;
        if (!sameItem) return false;
        const evtStart = evt.start ? new Date(evt.start).getTime() : 0;
        const evtEnd = evt.end ? new Date(evt.end).getTime() : 0;
        const pendingStart = new Date(pending.start).getTime();
        const pendingEnd = new Date(pending.end).getTime();
        return Math.abs(evtStart - pendingStart) < 60000 && Math.abs(evtEnd - pendingEnd) < 60000;
      });
    });

    const stillPending = pendingWorkBlocks.current.filter((wb) => {
      return !serverEvents.some((evt: CalendarEventData) =>
        evt.source === 'google' &&
        Math.abs(new Date(evt.start).getTime() - new Date(wb.start).getTime()) < 60000 &&
        Math.abs(new Date(evt.end).getTime() - new Date(wb.end).getTime()) < 60000
      );
    });

    pendingScheduledItems.current = stillPendingScheduled;
    pendingWorkBlocks.current = stillPending;
    return [...serverEvents, ...stillPendingScheduled, ...stillPending];
  }, [calendarEvents]);

  // Initialize FullCalendar Draggable on the left panel
  useEffect(() => {
    const container = draggableContainerRef.current;
    if (!container) return;

    const draggable = new Draggable(container, {
      itemSelector: '.fc-event',
      eventData(eventEl) {
        const raw = eventEl.getAttribute('data-event');
        if (!raw) return { title: 'Untitled' };
        return JSON.parse(raw);
      },
    });

    return () => draggable.destroy();
  }, [unscheduledItems?.length]);

  // Update calendar view when viewMode changes
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(viewMode === 'day' ? 'timeGridDay' : 'timeGridWeek');
  }, [viewMode]);

  // Update calendar date range when dateRange changes
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.gotoDate(dateRange.start);
  }, [dateRange.start]);

  const handleDatesSet = useCallback((info: { startStr: string; endStr: string }) => {
    setVisibleRange({ start: info.startStr, end: info.endStr });
  }, []);

  // Dismiss popover on outside click
  useEffect(() => {
    if (!selectedEventPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedEventPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedEventPopover]);

  // Calculate scheduled hours within the date range
  const scheduledMinutes = useMemo(() => {
    if (!displayEvents.length) return 0;
    const activeRange = visibleRange ?? dateRange;
    const rangeStart = new Date(activeRange.start).getTime();
    const rangeEnd = new Date(activeRange.end).getTime();

    // Only count user-scheduled work events (tasks, aims) — exclude meetings, google, powerdown, etc.
    const workEvents = displayEvents.filter((evt: CalendarEventData) =>
      evt.source === 'tasks' || evt.source === 'aims'
    );
    return workEvents.reduce((total: number, evt: CalendarEventData) => {
      const evtStart = new Date(evt.start).getTime();
      const evtEnd = new Date(evt.end).getTime();
      // Only count events within the date range
      if (evtEnd > rangeStart && evtStart < rangeEnd) {
        const overlapStart = Math.max(evtStart, rangeStart);
        const overlapEnd = Math.min(evtEnd, rangeEnd);
        return total + (overlapEnd - overlapStart) / 60000;
      }
      return total;
    }, 0);
  }, [displayEvents, visibleRange, dateRange]);

  // Group unscheduled items
  const groupedItems = useMemo(() => {
    return ITEM_GROUPS.map((group) => ({
      ...group,
      items: unscheduledItems.filter(group.filter),
    })).filter((g) => g.items.length > 0);
  }, [unscheduledItems]);

  // --- Completion handler ---
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
        mutateEvents();
        onRefresh?.();
      } else {
        toast.error(`Failed to complete ${label.toLowerCase()}`);
      }
    } catch {
      toast.error(`Failed to complete ${label.toLowerCase()}`);
    } finally {
      setCompletingEvent(false);
    }
  }, [toast, mutateEvents, onRefresh]);

  const handleCompleteAim = useCallback(
    (aimInstanceId: string) => handleComplete(`/api/aims/instances/${aimInstanceId}`, 'COMPLETED', 'Aim'),
    [handleComplete],
  );

  const handleCompleteTask = useCallback(
    (taskId: string) => handleComplete(`/api/tasks/${taskId}`, 'DONE', 'Task'),
    [handleComplete],
  );

  // --- Unschedule from popover ---
  const handleUnscheduleFromPopover = useCallback(async (
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
        mutateEvents();
        onRefresh?.();
      } else {
        toast.error(`Failed to unschedule ${label.toLowerCase()}`);
      }
    } catch {
      toast.error(`Failed to unschedule ${label.toLowerCase()}`);
    } finally {
      setCompletingEvent(false);
    }
  }, [toast, mutateEvents, onRefresh]);

  // --- Delete handlers ---
  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Task deleted');
        setSelectedEventPopover(null);
        mutateEvents();
        onRefresh?.();
      } else {
        toast.error('Failed to delete task');
      }
    } catch {
      toast.error('Failed to delete task');
    }
  }, [toast, mutateEvents, onRefresh]);

  const handleDeleteAim = useCallback(async (aimInstanceId: string) => {
    try {
      const res = await fetch(`/api/aims/instances/${aimInstanceId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Aim removed');
        setSelectedEventPopover(null);
        mutateEvents();
        onRefresh?.();
      } else {
        toast.error('Failed to delete aim');
      }
    } catch {
      toast.error('Failed to delete aim');
    }
  }, [toast, mutateEvents, onRefresh]);

  const handleDeleteGoogleEvent = useCallback(async (gcalEventId: string, calendarId: string) => {
    try {
      const res = await fetch(`/api/calendar/events/${gcalEventId}?calendarId=${encodeURIComponent(calendarId)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Event deleted from Google Calendar');
        setSelectedEventPopover(null);
        mutateEvents();
        onRefresh?.();
      } else {
        toast.error('Failed to delete Google Calendar event');
      }
    } catch {
      toast.error('Failed to delete Google Calendar event');
    }
  }, [toast, mutateEvents, onRefresh]);

  // --- Event click handler ---
  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps || {};
    const rect = info.el.getBoundingClientRect();
    const position = { top: rect.top + window.scrollY, left: rect.right + 8 };

    // Powerdown event
    if (props.link === '/powerdown' || info.event.id?.startsWith('powerdown-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'powerdown',
        status: '',
        position,
        link: '/powerdown',
      });
      return;
    }

    // Review events
    if (info.event.id?.startsWith('weekly-review-') || info.event.id?.startsWith('monthly-review-') || info.event.id?.startsWith('yearly-review-') || info.event.id?.startsWith('team-review-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'review',
        status: '',
        position,
        link: props.link || '/reviews',
      });
      return;
    }

    // Stored review event
    if (info.event.id?.startsWith('review-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'review',
        status: props.completed ? 'completed' : '',
        position,
        link: props.reviewId ? `/reviews/${props.reviewId}/complete` : '/reviews',
      });
      return;
    }

    // Process event
    if (info.event.id?.startsWith('process-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'process',
        status: '',
        position,
        link: '/processes',
      });
      return;
    }

    // Meeting event
    if (info.event.id?.startsWith('meeting-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'meeting',
        status: '',
        position,
        description: props.description,
        cadence: props.cadence,
        createdBy: props.createdBy,
        link: props.meetLink,
      });
      return;
    }

    // Aim event
    if (props.aimInstanceId) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'aims',
        status: props.status || 'SCHEDULED',
        position,
        aimInstanceId: props.aimInstanceId,
        aimCategoryName: props.aimCategoryName,
        selectedActivity: props.selectedActivity,
      });
      return;
    }

    // Task event
    if (props.taskId || info.event.id?.startsWith('task-')) {
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'task',
        status: props.status || 'TODO',
        position,
        taskId: props.taskId || info.event.id?.replace('task-', ''),
        taskType: props.taskType,
        priority: props.priority,
        goalTitle: props.goalTitle,
        description: props.description,
      });
      return;
    }

    // Google Calendar event
    if (info.event.id?.startsWith('google-')) {
      const rawId = info.event.id.replace('google-', '');
      setSelectedEventPopover({
        eventId: info.event.id,
        title: info.event.title,
        source: 'google',
        status: '',
        position,
        description: props.description,
        gcalEventId: rawId,
        gcalCalendarId: props.calendarId || 'primary',
        link: props.meetLink,
      });
    }
  }, []);

  // FullCalendar event receive handler (external drop)
  const handleEventReceive = useCallback(
    async (info: EventReceiveArg) => {
      const { itemId, itemType, durationMin } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const fallbackMs = (durationMin ?? 60) * 60 * 1000;
      const end = info.event.end ?? new Date(start.getTime() + fallbackMs);
      const title = info.event.title;

      // Work block template: create a Google Calendar event rather than scheduling a task
      if (itemType === 'work_block_template') {
        info.event.remove();
        // Store a persistent placeholder that survives SWR revalidation
        const placeholder = {
          id: `work-block-${Date.now()}`,
          title: title || 'Work Block',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          source: 'google',
        };
        pendingWorkBlocks.current = [...pendingWorkBlocks.current, placeholder];
        // Force a re-render so displayEvents includes the placeholder
        mutateEvents((currentData: unknown) => currentData, { revalidate: false });

        try {
          await onCreateWorkBlock?.(start, end, title);
        } catch {
          toast.error('Failed to create work block.');
        }
        // Revalidate — displayEvents merges pending blocks until server catches up
        mutateEvents();
        return;
      }

      // Snap to containing work block if dropping a task in schedule_tasks mode
      let snapStart = start;
      let snapEnd = end;
      if (mode === 'schedule_tasks' && displayEvents.length) {
        const block = displayEvents.find((evt: CalendarEventData) => {
          if (evt.source !== 'google') return false;
          const evtStart = new Date(evt.start);
          const evtEnd = new Date(evt.end);
          return start >= evtStart && start < evtEnd;
        });
        if (block) {
          snapStart = new Date(block.start);
          snapEnd = new Date(block.end);
        }
      }

      try {
        await onSchedule(itemId, itemType, snapStart, snapEnd);
        pendingScheduledItems.current = [
          ...pendingScheduledItems.current.filter((evt) => !(evt.itemId === itemId && evt.itemType === itemType)),
          {
            id: `pending-${itemType}-${itemId}`,
            title,
            start: snapStart.toISOString(),
            end: snapEnd.toISOString(),
            allDay: false,
            source: itemType === 'aim' ? 'aims' : 'tasks',
            itemId,
            itemType,
            ...(itemType === 'aim' ? { aimInstanceId: itemId } : { taskId: itemId }),
          },
        ];
        mutateEvents((currentData: unknown) => currentData, { revalidate: false });
        // After successful schedule, remove the FullCalendar ghost (server data takes over)
        info.event.remove();
        // Refetch calendar events and sidebar items from server
        await mutateEvents();
        onRefresh?.();
      } catch {
        // Remove the ghost on failure too so it doesn't linger
        info.event.remove();
        await mutateEvents();
        onRefresh?.();
        toast.error('Failed to schedule item. Please try again.');
      }
    },
    [onSchedule, onCreateWorkBlock, mutateEvents, onRefresh, mode, displayEvents, toast],
  );

  // Shared handler for event resize and internal drag-move
  const handleEventUpdate = useCallback(
    async (info: EventDropArg | EventResizeDoneArg) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end as Date;
      try {
        await onSchedule(itemId, itemType, start, end);
        pendingScheduledItems.current = [
          ...pendingScheduledItems.current.filter((evt) => !(evt.itemId === itemId && evt.itemType === itemType)),
          {
            id: `pending-${itemType}-${itemId}`,
            title: info.event.title,
            start: start.toISOString(),
            end: end.toISOString(),
            allDay: false,
            source: itemType === 'aim' ? 'aims' : 'tasks',
            itemId,
            itemType,
            ...(itemType === 'aim' ? { aimInstanceId: itemId } : { taskId: itemId }),
          },
        ];
        mutateEvents((currentData: unknown) => currentData, { revalidate: false });
        await mutateEvents();
        onRefresh?.();
      } catch {
        info.revert();
        toast.error('Failed to update scheduled item. Please try again.');
      }
    },
    [onSchedule, mutateEvents, onRefresh, toast],
  );

  // Custom event content renderer with unschedule button
  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => {
      const { itemId, itemType, source } = eventInfo.event.extendedProps ?? {};
      const colors = getEventColor(eventInfo.event, isDark);
      const isGoogleEvent = source === 'google';

      return (
        <div
          className="relative h-full w-full overflow-hidden rounded px-1.5 py-1 text-xs leading-tight"
          style={{
            backgroundColor: colors.bg,
            borderLeft: `3px solid ${colors.border}`,
            color: colors.text,
          }}
        >
          <div className="font-medium truncate pr-5">{eventInfo.event.title}</div>
          {eventInfo.timeText && (
            <div className="text-[10px] opacity-75 mt-0.5">{eventInfo.timeText}</div>
          )}
          {!isGoogleEvent && itemId && (
            <button
              type="button"
              className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-[var(--surface-raised)]/80 hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-colors text-[10px] leading-none"
              title="Unschedule"
              onClick={async (e) => {
                e.stopPropagation();
                await onUnschedule(itemId, itemType);
                mutateEvents();
                onRefresh?.();
              }}
            >
              &times;
            </button>
          )}
        </div>
      );
    },
    [onUnschedule, mutateEvents, onRefresh, isDark],
  );

  return (
    <div className="flex flex-col lg:flex-row h-full w-full min-h-[500px] rounded-xl border border-[var(--border-color)] bg-[var(--surface)] overflow-hidden">
      {/* Left Panel — Available Work Blocks / Available Work */}
      <div className={`w-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--border-color)] bg-[var(--surface-raised)]/50 ${isMobile && !mobileItemsExpanded ? '' : ''}`}>
        {/* Header — collapsible on mobile */}
        <button
          onClick={() => isMobile && setMobileItemsExpanded(!mobileItemsExpanded)}
          className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] lg:cursor-default"
        >
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {mode === 'work_blocks' ? 'Available Work Blocks' : 'Available Work'}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] tabular-nums">
              {unscheduledItems.length} item{unscheduledItems.length !== 1 ? 's' : ''}
            </span>
            <span className="lg:hidden text-[var(--text-muted)]">
              {mobileItemsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </button>

        {/* Scrollable item list — hidden on mobile when collapsed */}
        <div ref={draggableContainerRef} className={`overflow-y-auto px-3 py-3 space-y-4 ${isMobile && !mobileItemsExpanded ? 'hidden' : 'flex-1 max-h-[300px] lg:max-h-none'}`}>
          {mode === 'work_blocks' ? (
            <>
              {/* Deep Work (AIM Block) — always shown with reusable template */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">{'\uD83D\uDCAA'}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-500">
                    Deep Work (AIM Block)
                  </span>
                </div>
                <DeepWorkTemplateCard duration={aimBlockDuration} />
                {unscheduledItems.filter((i) => i.itemType === 'aim').length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">AIM Instances</p>
                    {unscheduledItems
                      .filter((i) => i.itemType === 'aim')
                      .map((item) => (
                        <UnscheduledCard key={item.id} item={item} colorKey="AIM" />
                      ))}
                  </div>
                )}
              </div>

              {/* Normal Work Block template — always shown, reusable */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                    Normal Work Block
                  </span>
                </div>
                <WorkBlockTemplateCard />
              </div>
            </>
          ) : (
            <>
              {groupedItems.length === 0 && (
                <div className="text-center text-sm text-[var(--text-muted)] py-8">
                  All items scheduled
                </div>
              )}

              {groupedItems.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{group.emoji}</span>
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: PRISM_COLORS[group.colorKey]?.color ?? '#64748b' }}
                    >
                      {group.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">{group.items.length}</span>
                  </div>
                  {group.items.map((item) => (
                    <UnscheduledCard key={item.id} item={item} colorKey={group.colorKey} />
                  ))}
                </div>
              ))}

              {showWorkBlockTemplates && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                      Work Blocks
                    </span>
                  </div>
                  <WorkBlockTemplateCard />
                  <div className="mt-2" />
                  <DeepWorkTemplateCard duration={aimBlockDuration} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Weekly hour target bar */}
        <WeeklyHourBar scheduledMinutes={scheduledMinutes} />
      </div>

      {/* Right Panel — Calendar */}
      <div className="w-full lg:w-[65%] flex flex-col min-h-[350px]">
        <div className={`flex-1 p-1 sm:p-2 overflow-hidden calendar-split-view ${isDark ? 'fc-dark-theme' : 'fc-light-theme'}`}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={viewMode === 'day' ? 'timeGridDay' : 'timeGridWeek'}
            initialDate={dateRange.start}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: '',
            }}
            events={displayEvents}
            editable
            droppable
            eventResizableFromStart
            eventDurationEditable
            eventReceive={handleEventReceive}
            eventResize={handleEventUpdate}
            eventDrop={handleEventUpdate}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            datesSet={handleDatesSet}
            eventDidMount={(info) => {
              const props = info.event.extendedProps || {};
              if (props.isPinned) {
                const pinEl = document.createElement('span');
                pinEl.textContent = '\u{1F4CC}';
                pinEl.style.cssText = 'position:absolute;top:2px;right:4px;font-size:10px;';
                info.el.style.position = 'relative';
                info.el.appendChild(pinEl);
              }
              if (props.aimInstanceId && props.tasks && props.tasks.length > 0) {
                const badge = document.createElement('span');
                const doneCount = props.tasks.filter((t: { status: string }) => t.status === 'DONE').length;
                badge.textContent = `${doneCount}/${props.tasks.length}`;
                badge.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:9px;background:rgba(0,0,0,0.4);color:#fff;border-radius:4px;padding:0 4px;line-height:1.4;';
                info.el.style.position = 'relative';
                info.el.appendChild(badge);
              }
            }}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="06:00:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            nowIndicator
            height="100%"
            expandRows
            stickyHeaderDates={false}
          />
        </div>
      </div>

      {/* Event Popover */}
      {selectedEventPopover && (
        <>
          {isMobile && (
            <div className="fixed inset-0 z-[59] bg-black/40" onClick={() => setSelectedEventPopover(null)} />
          )}
          <div
            ref={popoverRef}
            className={isMobile
              ? 'fixed inset-x-0 bottom-0 z-[60] w-full rounded-t-xl border-t border-[var(--border-color)] bg-[var(--background)] shadow-2xl backdrop-blur-sm pb-6'
              : 'fixed z-[60] w-72 rounded-xl border border-[var(--border-color)] bg-[var(--background)] shadow-2xl backdrop-blur-sm'
            }
            style={isMobile ? undefined : {
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
                  {selectedEventPopover.description && (
                    <div className="text-xs text-[var(--text-secondary)] line-clamp-3 mt-1">
                      {selectedEventPopover.description}
                    </div>
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

              {/* MEETING popover */}
              {selectedEventPopover.source === 'meeting' && (
                <>
                  {selectedEventPopover.cadence && (
                    <div className="text-xs text-[var(--text-muted)]">
                      <span className="font-medium">Cadence:</span> {selectedEventPopover.cadence.toLowerCase().replace('_', ' ')}
                    </div>
                  )}
                  {selectedEventPopover.createdBy && (
                    <div className="text-xs text-[var(--text-muted)]">
                      <span className="font-medium">Created by:</span> {selectedEventPopover.createdBy}
                    </div>
                  )}
                  {selectedEventPopover.description && (
                    <div className="text-xs text-[var(--text-secondary)] mt-1">{selectedEventPopover.description}</div>
                  )}
                </>
              )}
            </div>

            {/* Popover Actions */}
            <div className="px-4 py-3 border-t border-[var(--border-color)] flex flex-col gap-2">
              {/* Aim actions */}
              {selectedEventPopover.source === 'aims' && selectedEventPopover.status !== 'COMPLETED' && (
                <button
                  onClick={() => selectedEventPopover.aimInstanceId && handleCompleteAim(selectedEventPopover.aimInstanceId)}
                  disabled={completingEvent}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {completingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Complete
                </button>
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
                    onClick={() => handleUnscheduleFromPopover(`/api/aims/instances/${selectedEventPopover.aimInstanceId}`, 'Aim')}
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
                </div>
              )}
              {selectedEventPopover.source === 'task' && selectedEventPopover.taskId && (
                <>
                  <button
                    onClick={() => handleUnscheduleFromPopover(`/api/tasks/${selectedEventPopover.taskId}`, 'Task')}
                    disabled={completingEvent}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Unschedule
                  </button>
                  <button
                    onClick={() => selectedEventPopover.taskId && handleDeleteTask(selectedEventPopover.taskId)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
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

              {/* Process: Open */}
              {selectedEventPopover.source === 'process' && (
                <button
                  onClick={() => {
                    router.push('/processes');
                    setSelectedEventPopover(null);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                  Open
                </button>
              )}

              {/* Meeting: Join (if meet link) */}
              {selectedEventPopover.source === 'meeting' && selectedEventPopover.link && (
                <a
                  href={selectedEventPopover.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  Join Meeting
                </a>
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
            </div>
          </div>
        </>
      )}

      {/* Task Editor Modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={() => {
            setEditingTask(null);
            mutateEvents();
            onRefresh?.();
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
