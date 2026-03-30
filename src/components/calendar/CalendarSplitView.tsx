'use client';

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { PRISM_COLORS, WEEKLY_HOUR_TARGET, WEEKLY_HOUR_WARNING } from '@/lib/prism-colors';

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
  onSchedule: (itemId: string, itemType: string, start: Date, end: Date) => void;
  onUnschedule: (itemId: string, itemType: string) => void;
  onRefresh?: () => void;
  showAimGrouping?: boolean;
  mode?: 'work_blocks' | 'schedule_tasks';
  onCreateWorkBlock?: (start: Date, end: Date) => void;
  /** Duration in minutes for the Deep Work (AIM Block) template. Defaults to 60. */
  aimBlockDuration?: number;
}

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
    emoji: '🎯',
    filter: (i) => i.itemType === 'task' && i.taskType === 'IMPROVE',
    colorKey: 'IMPROVE',
  },
  {
    key: 'react',
    label: 'React Tasks',
    emoji: '⚡',
    filter: (i) => i.itemType === 'task' && i.taskType === 'REACT',
    colorKey: 'REACT',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    emoji: '🔧',
    filter: (i) => i.itemType === 'task' && i.taskType === 'MAINTENANCE',
    colorKey: 'MAINTENANCE',
  },
  {
    key: 'aim',
    label: 'AIMs',
    emoji: '💪',
    filter: (i) => i.itemType === 'aim',
    colorKey: 'AIM',
  },
  {
    key: 'review',
    label: 'Reviews',
    emoji: '📋',
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
      <span className="text-sm font-medium text-gray-800">Normal Work Block</span>
      <div className="mt-1 text-xs text-gray-500">60m · reusable</div>
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
      <span className="text-sm font-medium text-gray-800">Deep Work (AIM Block)</span>
      <div className="mt-1 text-xs text-gray-500">{duration}m · reusable</div>
    </div>
  );
}

function priorityBadge(priority?: string) {
  if (!priority) return null;
  const styles: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-700 border-red-300',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-300',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    LOW: 'bg-green-100 text-green-700 border-green-300',
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${styles[priority] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}
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

function getEventColor(event: any): { bg: string; border: string; text: string } {
  if (event.extendedProps?.source === 'google') {
    return {
      bg: PRISM_COLORS.GOOGLE_CAL?.bg ?? '#f3e8ff',
      border: PRISM_COLORS.GOOGLE_CAL?.border ?? '#a855f7',
      text: PRISM_COLORS.GOOGLE_CAL?.color ?? '#7c3aed',
    };
  }

  const taskType = event.extendedProps?.taskType;
  if (taskType && PRISM_COLORS[taskType as keyof typeof PRISM_COLORS]) {
    const c = PRISM_COLORS[taskType as keyof typeof PRISM_COLORS];
    return { bg: c.bg, border: c.border, text: c.color };
  }

  const itemType = event.extendedProps?.itemType;
  if (itemType === 'aim') {
    return { bg: PRISM_COLORS.AIM.bg, border: PRISM_COLORS.AIM.border, text: PRISM_COLORS.AIM.color };
  }
  if (itemType === 'review') {
    return { bg: PRISM_COLORS.REVIEW.bg, border: PRISM_COLORS.REVIEW.border, text: PRISM_COLORS.REVIEW.color };
  }

  return { bg: '#e0e7ff', border: '#6366f1', text: '#4338ca' };
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
        <span className="text-sm font-medium text-gray-800 leading-tight line-clamp-2">
          {item.title}
        </span>
        {priorityBadge(item.priority)}
      </div>
      <div className="mt-1 text-xs text-gray-500">{formatDuration(item.duration)}</div>
    </div>
  );
}

function WeeklyHourBar({ scheduledMinutes }: { scheduledMinutes: number }) {
  const scheduledHours = scheduledMinutes / 60;
  const targetHours = WEEKLY_HOUR_TARGET ?? 35;
  const warningThreshold = WEEKLY_HOUR_WARNING ?? 20;
  const pct = Math.min((scheduledHours / targetHours) * 100, 100);

  let barColor = 'bg-red-500';
  if (scheduledHours >= targetHours) barColor = 'bg-green-500';
  else if (scheduledHours >= warningThreshold) barColor = 'bg-yellow-500';

  return (
    <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span className="font-medium">Weekly Target</span>
        <span>
          {scheduledHours.toFixed(1)}h / {targetHours}h scheduled
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
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
}: CalendarSplitViewProps) {
  const draggableContainerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<FullCalendar>(null);

  // Fetch existing calendar events for the date range
  const { events: calendarEvents, refreshEvents: mutateEvents } = useCalendarEvents(
    dateRange.start,
    dateRange.end,
  );

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
  }, []);

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

  // Calculate scheduled hours within the date range
  const scheduledMinutes = useMemo(() => {
    if (!calendarEvents) return 0;
    const rangeStart = new Date(dateRange.start).getTime();
    const rangeEnd = new Date(dateRange.end).getTime();

    return calendarEvents.reduce((total: number, evt: any) => {
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
  }, [calendarEvents, dateRange]);

  // Group unscheduled items
  const groupedItems = useMemo(() => {
    return ITEM_GROUPS.map((group) => ({
      ...group,
      items: unscheduledItems.filter(group.filter),
    })).filter((g) => g.items.length > 0);
  }, [unscheduledItems]);

  // FullCalendar event receive handler (external drop)
  const handleEventReceive = useCallback(
    (info: any) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end as Date;

      // Work block template: create a Google Calendar event rather than scheduling a task
      if (itemType === 'work_block_template') {
        info.event.remove();
        onCreateWorkBlock?.(start, end);
        mutateEvents();
        return;
      }

      onSchedule(itemId, itemType, start, end);
      // Remove the auto-added event — the parent will re-render with updated data
      info.event.remove();
      mutateEvents();
      onRefresh?.();
    },
    [onSchedule, onCreateWorkBlock, mutateEvents, onRefresh],
  );

  // Event resize handler
  const handleEventResize = useCallback(
    (info: any) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end as Date;
      onSchedule(itemId, itemType, start, end);
      mutateEvents();
    },
    [onSchedule, mutateEvents],
  );

  // Event drop (move) handler
  const handleEventDrop = useCallback(
    (info: any) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end as Date;
      onSchedule(itemId, itemType, start, end);
      mutateEvents();
    },
    [onSchedule, mutateEvents],
  );

  // Custom event content renderer with unschedule button
  const renderEventContent = useCallback(
    (eventInfo: any) => {
      const { itemId, itemType, source } = eventInfo.event.extendedProps ?? {};
      const colors = getEventColor(eventInfo.event);
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
              className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-white/80 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors text-[10px] leading-none"
              title="Unschedule"
              onClick={(e) => {
                e.stopPropagation();
                onUnschedule(itemId, itemType);
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
    [onUnschedule, mutateEvents, onRefresh],
  );

  return (
    <div className="flex h-full w-full min-h-[500px] rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Left Panel — Available Work Blocks / Available Work (35%) */}
      <div className="w-[35%] flex flex-col border-r border-gray-200 bg-gray-50/50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">
            {mode === 'work_blocks' ? 'Available Work Blocks' : 'Available Work'}
          </h3>
          <span className="text-xs text-gray-500 tabular-nums">
            {unscheduledItems.length} item{unscheduledItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Scrollable item list */}
        <div ref={draggableContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {mode === 'work_blocks' ? (
            <>
              {/* Deep Work (AIM Block) — always shown with reusable template */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">💪</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-500">
                    Deep Work (AIM Block)
                  </span>
                </div>
                <DeepWorkTemplateCard duration={aimBlockDuration} />
                {unscheduledItems.filter((i) => i.itemType === 'aim').length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">AIM Instances</p>
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
                <div className="text-center text-sm text-gray-400 py-8">
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
                    <span className="text-[10px] text-gray-400 ml-auto">{group.items.length}</span>
                  </div>
                  {group.items.map((item) => (
                    <UnscheduledCard key={item.id} item={item} colorKey={group.colorKey} />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Weekly hour target bar */}
        <WeeklyHourBar scheduledMinutes={scheduledMinutes} />
      </div>

      {/* Right Panel — Calendar (65%) */}
      <div className="w-[65%] flex flex-col">
        <div className="flex-1 p-2 overflow-hidden calendar-split-view">
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
            events={calendarEvents ?? []}
            editable
            droppable
            eventResizableFromStart
            eventDurationEditable
            eventReceive={handleEventReceive}
            eventResize={handleEventResize}
            eventDrop={handleEventDrop}
            eventContent={renderEventContent}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            nowIndicator
            height="100%"
            expandRows
            stickyHeaderDates={false}
          />
        </div>
      </div>
    </div>
  );
}
