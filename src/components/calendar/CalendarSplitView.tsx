'use client';

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  onCreateWorkBlock?: (start: Date, end: Date) => void | Promise<void>;
  /** Duration in minutes for the Deep Work (AIM Block) template. Defaults to 60. */
  aimBlockDuration?: number;
  /** Show work block template cards at the bottom of the left panel (default mode only). */
  showWorkBlockTemplates?: boolean;
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

function getEventColor(event: any, isDark: boolean): { bg: string; border: string; text: string } {
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
  const colorKey = ITEM_TYPE_MAP[props.itemType];
  if (colorKey) {
    return colorFromDef(PRISM_COLORS[colorKey], isDark);
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [mobileItemsExpanded, setMobileItemsExpanded] = useState(false);

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

  // Optimistically add an event to the SWR cache, handling both response shapes
  const addOptimisticEvent = useCallback(
    (newEvent: Record<string, any>) => {
      mutateEvents((currentData: any) => {
        if (!currentData) return currentData;
        const events = Array.isArray(currentData) ? currentData : (currentData?.events ?? []);
        const updated = [...events, newEvent];
        return Array.isArray(currentData) ? updated : { ...currentData, events: updated };
      }, { revalidate: true });
    },
    [mutateEvents],
  );

  // FullCalendar event receive handler (external drop)
  const handleEventReceive = useCallback(
    async (info: any) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end ?? new Date(start.getTime() + 60 * 60 * 1000);
      const title = info.event.title;

      // Work block template: create a Google Calendar event rather than scheduling a task
      if (itemType === 'work_block_template') {
        info.event.remove();
        await onCreateWorkBlock?.(start, end);
        addOptimisticEvent({
          id: `google-pending-${Date.now()}`,
          title: title || 'Work Block',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          source: 'google',
        });
        return;
      }

      // Snap to containing work block if dropping a task in schedule_tasks mode
      let snapStart = start;
      let snapEnd = end;
      if (mode === 'schedule_tasks' && calendarEvents) {
        const block = calendarEvents.find((evt: any) => {
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
        info.event.remove();
        await onSchedule(itemId, itemType, snapStart, snapEnd);
        const idPrefix = itemType === 'aim' ? 'aim' : 'task';
        const source = itemType === 'aim' ? 'aims' : 'tasks';
        addOptimisticEvent({
          id: `${idPrefix}-${itemId}`,
          title,
          start: snapStart.toISOString(),
          end: snapEnd.toISOString(),
          allDay: false,
          source,
          itemId,
          itemType,
          taskType: info.event.extendedProps?.taskType,
        });
        onRefresh?.();
      } catch {
        // Re-fetch to restore correct state on error
        mutateEvents();
      }
    },
    [onSchedule, onCreateWorkBlock, mutateEvents, addOptimisticEvent, onRefresh, mode, calendarEvents],
  );

  // Shared handler for event resize and internal drag-move
  const handleEventUpdate = useCallback(
    async (info: any) => {
      const { itemId, itemType } = info.event.extendedProps ?? {};
      if (!itemId || !itemType) return;
      const start = info.event.start as Date;
      const end = info.event.end as Date;
      await onSchedule(itemId, itemType, start, end);
      mutateEvents();
    },
    [onSchedule, mutateEvents],
  );

  // Custom event content renderer with unschedule button
  const renderEventContent = useCallback(
    (eventInfo: any) => {
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
        <div className="flex-1 p-1 sm:p-2 overflow-hidden calendar-split-view">
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
            eventResize={handleEventUpdate}
            eventDrop={handleEventUpdate}
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
