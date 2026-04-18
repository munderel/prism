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
import { InlineTaskCreator } from '@/components/tasks/InlineTaskCreator';
import { PRISM_COLORS, WEEKLY_HOUR_TARGET, WEEKLY_HOUR_WARNING } from '@/lib/prism-colors';
import type { ColorDef } from '@/lib/prism-colors';
import { getWeekBoundaries, parseLocalDate } from '@/lib/date-utils';

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
  /** Google Calendar IDs whose events count toward the weekly hour target. */
  weeklyTargetCalendarIds?: string[];
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

const FOOD_BLOCK_TEMPLATE_ID = '__food_block_template__';

function FoodBlockTemplateCard() {
  return (
    <div
      className="fc-event cursor-grab rounded-lg border px-3 py-2 mb-1.5 hover:shadow-md transition-shadow"
      style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b', borderWidth: '1px' }}
      data-event={JSON.stringify({
        id: FOOD_BLOCK_TEMPLATE_ID,
        title: 'Meal',
        duration: { minutes: 30 },
        extendedProps: { itemId: FOOD_BLOCK_TEMPLATE_ID, itemType: 'food_block_template' },
      })}
    >
      <span className="text-sm font-medium text-[var(--text-primary)]">🍽️ Meal</span>
      <div className="mt-1 text-xs text-[var(--text-secondary)]">30m · reusable</div>
    </div>
  );
}

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

function hexToColorTriplet(hex: string, isDark: boolean): { bg: string; border: string; text: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = `rgba(${r},${g},${b},0.15)`;
  const border = hex;
  const text = isDark
    ? `#${Math.round(r + (255 - r) * 0.4).toString(16).padStart(2, '0')}${Math.round(g + (255 - g) * 0.4).toString(16).padStart(2, '0')}${Math.round(b + (255 - b) * 0.4).toString(16).padStart(2, '0')}`
    : `#${Math.round(r * 0.55).toString(16).padStart(2, '0')}${Math.round(g * 0.55).toString(16).padStart(2, '0')}${Math.round(b * 0.55).toString(16).padStart(2, '0')}`;
  return { bg, border, text };
}

function getEventColor(event: { extendedProps?: Record<string, unknown> }, isDark: boolean): { bg: string; border: string; text: string } {
  const props = event.extendedProps ?? {};

  // Use the API-provided color as the single source of truth (matches main CalendarView)
  const apiColor = props.color as string | undefined;
  if (apiColor && typeof apiColor === 'string' && apiColor.startsWith('#') && apiColor.length === 7) {
    return hexToColorTriplet(apiColor, isDark);
  }

  // Fallback: derive from PRISM_COLORS for events without a valid hex color
  if (props.source === 'google') {
    return colorFromDef(PRISM_COLORS.GOOGLE_CAL, isDark);
  }

  const taskType = props.taskType as keyof typeof PRISM_COLORS | undefined;
  if (taskType && PRISM_COLORS[taskType]) {
    return colorFromDef(PRISM_COLORS[taskType], isDark);
  }

  const ITEM_TYPE_MAP: Record<string, keyof typeof PRISM_COLORS> = { aim: 'AIM', review: 'REVIEW' };
  const colorKey = ITEM_TYPE_MAP[props.itemType as string];
  if (colorKey) {
    return colorFromDef(PRISM_COLORS[colorKey], isDark);
  }

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
  weeklyTargetCalendarIds,
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

  // When in day view, fetch the full week's events for the weekly hour target bar.
  // In week view the visible range already covers the full week, so we skip the extra fetch.
  const weekRange = useMemo(() => {
    const ref = new Date(dateRange.start);
    const { start, end } = getWeekBoundaries(ref);
    // getWeekBoundaries returns YYYY-MM-DD strings; convert to ISO for the API
    const weekStart = parseLocalDate(start).toISOString();
    const weekEndDate = parseLocalDate(end);
    weekEndDate.setDate(weekEndDate.getDate() + 1); // make end exclusive (Mon-Sun → Mon 00:00 to next Mon 00:00)
    return { start: weekStart, end: weekEndDate.toISOString() };
  }, [dateRange.start]);

  const needsWeekFetch = viewMode === 'day';
  const { events: weeklyEvents } = useCalendarEvents(
    needsWeekFetch ? weekRange.start : null,
    needsWeekFetch ? weekRange.end : null,
  );

  // Merge pending work block placeholders with server events.
  // Placeholders are auto-removed once a matching server event appears (by time overlap).
  const displayEvents = useMemo(() => {
    const serverEvents = calendarEvents ?? [];
    const stillPendingScheduled = pendingScheduledItems.current.filter((pending) => {
      return !serverEvents.some((evt: CalendarEventData) => {
        // Match by itemId+itemType or by ID prefix pattern (pending-aim-X vs aim-X)
        const sameItem = (evt.itemId === pending.itemId && evt.itemType === pending.itemType)
          || evt.id === pending.itemId
          || evt.id === `${pending.itemType}-${pending.itemId}`;
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

  // Calculate scheduled hours for the FULL WEEK for the weekly target bar.
  // In week view the display events already cover the week; in day view we use
  // a separate week-scoped fetch so the bar always reflects the whole week.
  const scheduledMinutes = useMemo(() => {
    const eventsForWeek = needsWeekFetch ? (weeklyEvents ?? []) : displayEvents;
    if (!eventsForWeek.length) return 0;

    const rangeStart = new Date(weekRange.start).getTime();
    const rangeEnd = new Date(weekRange.end).getTime();

    // Count tasks, aims, and Google Calendar events from selected calendars.
    // When weeklyTargetCalendarIds is empty/undefined, fall back to counting
    // ALL Google calendar events (default = primary calendar behaviour).
    const hasCalendarFilter = weeklyTargetCalendarIds && weeklyTargetCalendarIds.length > 0;
    const workEvents = eventsForWeek.filter((evt: CalendarEventData) =>
      evt.source === 'tasks' || evt.source === 'aims' ||
      (evt.source === 'google' && (hasCalendarFilter ? !!evt.calendarId && weeklyTargetCalendarIds!.includes(evt.calendarId) : true))
    );
    return workEvents.reduce((total: number, evt: CalendarEventData) => {
      const evtStart = new Date(evt.start).getTime();
      const evtEnd = new Date(evt.end).getTime();
      // Only count events within the week range
      if (evtEnd > rangeStart && evtStart < rangeEnd) {
        const overlapStart = Math.max(evtStart, rangeStart);
        const overlapEnd = Math.min(evtEnd, rangeEnd);
        return total + (overlapEnd - overlapStart) / 60000;
      }
      return total;
    }, 0);
  }, [needsWeekFetch, weeklyEvents, displayEvents, weekRange, weeklyTargetCalendarIds]);

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
        const data = await res.json().catch(() => ({}));
        toast.success(`${label} completed!`);
        if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
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

  // --- Delete handlers (optimistic removal) ---
  const optimisticRemoveEvent = useCallback((matchFn: (evt: CalendarEventData) => boolean) => {
    setSelectedEventPopover(null);
    mutateEvents((currentData: unknown) => {
      if (!currentData) return currentData;
      if (Array.isArray(currentData)) return currentData.filter((e: CalendarEventData) => !matchFn(e));
      const obj = currentData as { events?: CalendarEventData[] };
      if (obj.events) return { ...obj, events: obj.events.filter((e: CalendarEventData) => !matchFn(e)) };
      return currentData;
    }, { revalidate: false });
  }, [mutateEvents]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    optimisticRemoveEvent((e) => e.taskId === taskId || e.id === `task-${taskId}`);
    toast.success('Task deleted');
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) toast.error('Failed to delete task');
      mutateEvents();
      onRefresh?.();
    } catch {
      toast.error('Failed to delete task');
      mutateEvents();
    }
  }, [toast, mutateEvents, onRefresh, optimisticRemoveEvent]);

  const handleDeleteAim = useCallback(async (aimInstanceId: string) => {
    optimisticRemoveEvent((e) => e.aimInstanceId === aimInstanceId || e.id === `aim-${aimInstanceId}`);
    toast.success('Aim removed');
    try {
      const res = await fetch(`/api/aims/instances/${aimInstanceId}`, { method: 'DELETE' });
      if (!res.ok) toast.error('Failed to delete aim');
      mutateEvents();
      onRefresh?.();
    } catch {
      toast.error('Failed to delete aim');
      mutateEvents();
    }
  }, [toast, mutateEvents, onRefresh, optimisticRemoveEvent]);

  const handleDeleteGoogleEvent = useCallback(async (gcalEventId: string, calendarId: string) => {
    optimisticRemoveEvent((e) => e.gcalEventId === gcalEventId || e.id === gcalEventId);
    toast.success('Event deleted from Google Calendar');
    try {
      const res = await fetch(`/api/calendar/events/${gcalEventId}?calendarId=${encodeURIComponent(calendarId)}`, { method: 'DELETE' });
      if (!res.ok) toast.error('Failed to delete Google Calendar event');
      mutateEvents();
      onRefresh?.();
    } catch {
      toast.error('Failed to delete Google Calendar event');
      mutateEvents();
    }
  }, [toast, mutateEvents, onRefresh, optimisticRemoveEvent]);

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

  // If a drop lands within SNAP_NOW_WINDOW_MS of the current time on today's
  // column, snap the start to "now" rounded to the nearest 5 minutes. Mirrors
  // Google Calendar's magnetic nowIndicator behavior. Preserves the original
  // event duration so the end shifts along with the start.
  const snapToNow = useCallback((start: Date, end: Date): { start: Date; end: Date } => {
    const SNAP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes on either side of now
    const now = new Date();
    const sameDay = start.getFullYear() === now.getFullYear()
      && start.getMonth() === now.getMonth()
      && start.getDate() === now.getDate();
    if (!sameDay) return { start, end };
    if (Math.abs(start.getTime() - now.getTime()) > SNAP_WINDOW_MS) return { start, end };
    const snapped = new Date(now);
    const minutes = snapped.getMinutes();
    snapped.setMinutes(Math.round(minutes / 5) * 5, 0, 0);
    const durationMs = end.getTime() - start.getTime();
    const snappedEnd = new Date(snapped.getTime() + durationMs);
    return { start: snapped, end: snappedEnd };
  }, []);

  // FullCalendar event receive handler (external drop)
  const handleEventReceive = useCallback(
    async (info: EventReceiveArg) => {
      const { itemId, itemType, durationMin } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      let start = info.event.start as Date;
      const fallbackMs = (durationMin ?? 60) * 60 * 1000;
      let end = info.event.end ?? new Date(start.getTime() + fallbackMs);
      // Snap-to-now if drop is near the red "current time" line on today.
      ({ start, end } = snapToNow(start, end));
      const title = info.event.title;

      // Food block template: create a FoodBlock row (separate data plane)
      if (itemType === 'food_block_template') {
        info.event.remove();
        try {
          const res = await fetch('/api/food-blocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title || 'Meal',
              startAt: start.toISOString(),
              endAt: end.toISOString(),
            }),
          });
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          await mutateEvents();
          onRefresh?.();
        } catch {
          toast.error('Failed to create food block.');
        }
        return;
      }

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

      // Remove the FullCalendar ghost immediately and add a placeholder
      // so there's no visual gap while the API call is in flight.
      info.event.remove();
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

      // Fire-and-forget: schedule in background, keep pending placeholder for instant UI
      Promise.resolve(onSchedule(itemId, itemType, snapStart, snapEnd))
        .then(() => {
          // Clear the specific pending item before revalidating to prevent duplication
          pendingScheduledItems.current = pendingScheduledItems.current.filter(
            (evt) => !(evt.itemId === itemId && evt.itemType === itemType),
          );
          mutateEvents();
          onRefresh?.();
        })
        .catch(() => {
          // Remove the placeholder on failure
          pendingScheduledItems.current = pendingScheduledItems.current.filter(
            (evt) => !(evt.itemId === itemId && evt.itemType === itemType),
          );
          mutateEvents();
          onRefresh?.();
          toast.error('Failed to schedule item. Please try again.');
        });
    },
    [onSchedule, onCreateWorkBlock, mutateEvents, onRefresh, mode, displayEvents, toast, snapToNow],
  );

  // Shared handler for event resize and internal drag-move
  const handleEventUpdate = useCallback(
    async (info: EventDropArg | EventResizeDoneArg) => {
      const { itemId, itemType, meetingId, cadence } = info.event.extendedProps ?? {};

      // Meeting events don't have itemId/itemType — handle separately
      if (meetingId) {
        const startDate = info.event.start!;
        const endDate = info.event.end!;
        const timeStart = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
        const timeEnd = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
        const payload: Record<string, unknown> = { timeStart, timeEnd };
        if (cadence === 'ONE_TIME') {
          payload.occurDate = startDate.toISOString();
        } else {
          payload.dayOfWeek = startDate.getDay();
        }
        try {
          const res = await fetch(`/api/meetings/${meetingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          await mutateEvents();
          onRefresh?.();
        } catch {
          info.revert();
          toast.error('Failed to update meeting. Please try again.');
        }
        return;
      }

      if (!itemId || !itemType) return;
      let start = info.event.start as Date;
      let end = info.event.end as Date;
      // Snap to now red line on internal drag when landing close to it.
      ({ start, end } = snapToNow(start, end));

      // Food blocks have their own data plane — PATCH /api/food-blocks/[id]
      // directly instead of going through the task/aim onSchedule path.
      if (itemType === 'food') {
        try {
          const res = await fetch(`/api/food-blocks/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startAt: start.toISOString(), endAt: end.toISOString() }),
          });
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          await mutateEvents();
          onRefresh?.();
        } catch {
          info.revert();
          toast.error('Failed to move food block. Please try again.');
        }
        return;
      }

      try {
        await onSchedule(itemId, itemType, start, end);
        // Do NOT push a pending placeholder here: FullCalendar has already
        // moved the existing event optimistically to its new time, so adding
        // a second "pending" copy at the same time causes a visual duplicate
        // that lingers until the pending entry is reconciled with the server
        // response. Pending placeholders are only needed for external sidebar
        // drops (see the drop handler above) where the item isn't yet on the
        // canvas.
        // Also drop any stale pending entry for this item that may exist from
        // a prior external drop so it doesn't coexist with the refreshed
        // server event.
        pendingScheduledItems.current = pendingScheduledItems.current.filter(
          (evt) => !(evt.itemId === itemId && evt.itemType === itemType)
        );
        await mutateEvents();
        onRefresh?.();
      } catch {
        info.revert();
        toast.error('Failed to update scheduled item. Please try again.');
      }
    },
    [onSchedule, mutateEvents, onRefresh, toast, snapToNow],
  );

  // Custom event content renderer with unschedule button
  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => {
      const { itemId, itemType, source } = eventInfo.event.extendedProps ?? {};
      const colors = getEventColor(eventInfo.event, isDark);
      const isGoogleEvent = source === 'google';
      // Detect short events (≤ 10 min) to reduce padding and hide time text
      const durationMs = (eventInfo.event.end?.getTime() ?? 0) - (eventInfo.event.start?.getTime() ?? 0);
      const isShort = durationMs > 0 && durationMs <= 10 * 60 * 1000;

      // Unified styling matching the main CalendarView page: solid color
      // background from PRISM_COLORS (per type) with always-white title text
      // for consistent readability. Only differentiation is the background
      // color; no per-type text-color variation.
      return (
        <div
          className={`relative h-full w-full overflow-hidden rounded px-1.5 text-xs leading-tight ${isShort ? 'py-0.5' : 'py-1'}`}
          style={{
            backgroundColor: colors.border,
            borderLeft: `3px solid ${colors.border}`,
            color: '#ffffff',
          }}
        >
          <div className="font-medium truncate pr-5 text-white">{eventInfo.event.title}</div>
          {eventInfo.timeText && !isShort && (
            <div className="text-[10px] text-white/80 mt-0.5">{eventInfo.timeText}</div>
          )}
          {!isGoogleEvent && itemId && (
            <button
              type="button"
              className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-black/30 hover:bg-red-500/80 text-white/80 hover:text-white transition-colors text-[10px] leading-none"
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

              {/* Food block — drag a meal onto the calendar. */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                    Food
                  </span>
                </div>
                <FoodBlockTemplateCard />
              </div>
            </>
          ) : (
            <>
              {/* Quick React — fastest path to create a reactive task from
                  the calendar without leaving the sidebar. */}
              <div className="pb-3 border-b border-[var(--border-color)]">
                <InlineTaskCreator onCreated={() => { void onRefresh?.(); }} />
              </div>

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

              <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                    Food
                  </span>
                </div>
                <FoodBlockTemplateCard />
              </div>
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
            slotMaxTime="24:00:00"
            scrollTime="06:00:00"
            slotDuration="00:15:00"
            slotLabelInterval="01:00:00"
            snapDuration="00:05:00"
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
