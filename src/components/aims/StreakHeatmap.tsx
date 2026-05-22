'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  addDays,
  formatDateOnly,
  getLocalDateString,
  isoWeekKey,
  mondayOfWeek,
  parseLocalDate,
  startOfToday,
} from '@/lib/date-utils';
import { isDayActive } from '@/lib/aim-streak-engine';
import { HEATMAP_COLORS } from '@/lib/prism-colors';
import { isStreakMilestoneDay, isWeekCrossingDay } from '@/lib/heatmap-utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DayEntry {
  date: string;
  scheduled: boolean;
  completed: boolean;
}

export interface StreakHeatmapProps {
  aimCategoryId: string;
  /** true = daily AIM (uses activeWeekdays bitmask); false = weekly */
  isDaily: boolean;
  /** Sun=1 Mon=2 … Sat=64 bitmask — only meaningful when isDaily=true */
  activeWeekdays: number;
  /** Weekly completion target — only meaningful when isDaily=false */
  weeklyTarget: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Number of weeks rendered in one "page" */
const PAGE_WEEKS = 8;

// ── Daily-mode grid builder ──────────────────────────────────────────────────

export interface DailyCell {
  dateKey: string;
  state: 'completed' | 'gold' | 'missed' | 'inactive' | 'future' | 'empty';
}

/**
 * Build a 7-column grid of weeks.
 * weekOffset=0 → most recent 8 weeks; weekOffset=8 → the 8 weeks before that.
 *
 * If `isGoldDay` is provided, completed cells for which it returns true are
 * promoted to the 'gold' state (visually distinctive standout marker).
 *
 * @internal Exported for unit tests only.
 */
export function buildDailyGrid(
  history: DayEntry[],
  activeWeekdays: number,
  weekOffset: number,
  isGoldDay?: (dateKey: string) => boolean,
): DailyCell[][] {
  const today = startOfToday();
  const completedSet = new Set(history.filter((e) => e.completed).map((e) => e.date));

  // Sunday that starts the most-recent week shown
  const latestSunday = addDays(today, -today.getDay() - weekOffset * 7);

  const weeks: DailyCell[][] = [];
  for (let w = PAGE_WEEKS - 1; w >= 0; w--) {
    const week: DailyCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(latestSunday, -(w * 7) + d);
      const key = getLocalDateString(cellDate);
      const dow = cellDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const active = isDayActive(activeWeekdays, dow);
      const isFuture = cellDate > today;

      let state: DailyCell['state'];
      if (!active) {
        state = 'inactive';
      } else if (isFuture) {
        state = 'future';
      } else if (completedSet.has(key)) {
        state = isGoldDay?.(key) ? 'gold' : 'completed';
      } else {
        state = 'missed';
      }
      week.push({ dateKey: key, state });
    }
    weeks.push(week);
  }
  return weeks;
}

// ── Weekly-mode grid builder ─────────────────────────────────────────────────

export interface WeekCell {
  weekKey: string;
  /** Monday of the week */
  weekStart: Date;
  completions: number;
  target: number;
  state: 'met' | 'exceeded' | 'missed' | 'future';
}

/** @internal Exported for unit tests only. */
export function buildWeeklyGrid(
  history: DayEntry[],
  weeklyTarget: number,
  weekOffset: number,
): WeekCell[] {
  const today = startOfToday();
  const thisWeekMonday = mondayOfWeek(today);

  // Count completions per ISO week
  const weekCounts = new Map<string, number>();
  for (const entry of history) {
    if (entry.completed) {
      const key = isoWeekKey(parseLocalDate(entry.date));
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    }
  }

  const cells: WeekCell[] = [];
  for (let w = 0; w < PAGE_WEEKS; w++) {
    // One week per "Older" click, matching daily-mode pagination.
    const weekStart = addDays(thisWeekMonday, -(w + weekOffset) * 7);
    const key = isoWeekKey(weekStart);
    const completions = weekCounts.get(key) ?? 0;
    const effectiveTarget = Math.max(weeklyTarget, 1);

    const weekEnd = addDays(weekStart, 6);
    const isFuture = weekStart > today;
    const weekIsPast = weekEnd < today;

    let state: WeekCell['state'];
    if (isFuture) {
      state = 'future';
    } else if (completions > effectiveTarget) {
      state = 'exceeded';
    } else if (completions === effectiveTarget) {
      state = 'met';
    } else if (weekIsPast || completions < effectiveTarget) {
      // If the week is still in progress (weekStart <= today <= weekEnd) and
      // not yet hit, treat as future/pending so we don't false-red the current week
      state = weekIsPast ? 'missed' : 'future';
    } else {
      state = 'future';
    }

    cells.push({ weekKey: key, weekStart, completions, target: effectiveTarget, state });
  }

  // Return oldest→newest so the grid reads top-to-bottom chronologically
  return cells.reverse();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StreakHeatmap({
  aimCategoryId,
  isDaily,
  activeWeekdays,
  weeklyTarget,
}: StreakHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Fetch enough days to cover the current page + scrollback buffer.
  // For the daily grid: PAGE_WEEKS * 7 days per page.
  // Add +7 so the first week always has a full row of padding context.
  const fetchDays = (weekOffset + 1) * PAGE_WEEKS * 7 + 7;

  const { data: history } = useSWR<DayEntry[]>(
    `/api/aims/streak-history?aimCategoryId=${aimCategoryId}&days=${fetchDays}`
  );

  if (!history) return null;

  // ── Daily mode ──────────────────────────────────────────────────────────────

  if (isDaily) {
    const isGoldDay = (dateKey: string) =>
      isStreakMilestoneDay(history, activeWeekdays, dateKey) ||
      isWeekCrossingDay(history, weeklyTarget, dateKey);

    const grid = buildDailyGrid(history, activeWeekdays, weekOffset, isGoldDay);

    const handleMouseEnterDaily = (e: React.MouseEvent<HTMLDivElement>, cell: DailyCell) => {
      if (cell.state === 'empty') return;
      const label = (() => {
        switch (cell.state) {
          case 'completed': return 'Completed';
          case 'gold':      return 'Milestone day';
          case 'missed':    return 'Missed';
          case 'inactive':  return 'Not active';
          case 'future':    return 'Future';
        }
      })();
      const formatted = formatDateOnly(cell.dateKey, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ text: `${formatted} — ${label}`, x: rect.left + rect.width / 2, y: rect.top - 4 });
    };

    return (
      <div className="relative">
        {/* Column headers */}
        <div className="flex gap-[3px] mb-[2px] ml-[calc(0.75rem+2px)]">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="w-3 flex items-center justify-center text-[8px] text-[var(--text-muted)] leading-none">
              {i % 2 === 1 ? label : ''}
            </div>
          ))}
        </div>

        {/* Grid rows: each row is one week */}
        <div className="flex flex-col gap-[3px]">
          {grid.map((week, wIdx) => (
            <div key={wIdx} className="flex items-center gap-[3px]">
              {/* Week row — no label needed */}
              <div className="w-3 shrink-0" />
              {week.map((cell, dIdx) => (
                <div
                  key={dIdx}
                  className={`w-3 h-3 rounded-[2px] cursor-default transition-colors ${HEATMAP_COLORS[cell.state]}`}
                  onMouseEnter={(e) => handleMouseEnterDaily(e, cell)}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2 mt-1.5">
          {weekOffset > 0 && (
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              ← Newer
            </button>
          )}
          {history.length >= fetchDays - 7 && (
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors ml-auto"
            >
              Older →
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.completed}`} />
            <span>Done</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.gold}`} />
            <span>Gold</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.missed}`} />
            <span>Missed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.inactive} border border-white/10`} />
            <span>Off</span>
          </div>
        </div>

        {tooltip && (
          <div
            className="fixed z-50 px-2 py-1 text-[10px] font-medium text-white bg-gray-900 rounded shadow-lg pointer-events-none whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    );
  }

  // ── Weekly mode ─────────────────────────────────────────────────────────────

  const cells = buildWeeklyGrid(history, weeklyTarget, weekOffset);

  const handleMouseEnterWeekly = (e: React.MouseEvent<HTMLDivElement>, cell: WeekCell) => {
    const weekLabel = cell.weekKey;
    const statusLabel = (() => {
      switch (cell.state) {
        case 'met':      return `Met (${cell.completions}/${cell.target})`;
        case 'exceeded': return `Exceeded (${cell.completions}/${cell.target})`;
        case 'missed':   return `Missed (${cell.completions}/${cell.target})`;
        case 'future':   return `Upcoming`;
      }
    })();
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text: `${weekLabel} — ${statusLabel}`, x: rect.left + rect.width / 2, y: rect.top - 4 });
  };

  return (
    <div className="relative">
      <div className="flex flex-col gap-[3px]">
        {cells.map((cell) => (
          <div
            key={cell.weekKey}
            className={`flex items-center gap-1.5 h-4 rounded-[3px] px-1.5 cursor-default transition-colors ${HEATMAP_COLORS[cell.state]}`}
            onMouseEnter={(e) => handleMouseEnterWeekly(e, cell)}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="text-[8px] font-medium text-white/70 leading-none shrink-0 w-10 truncate">
              {cell.weekKey}
            </span>
            {cell.state !== 'future' && (
              <span className="text-[8px] text-white/80 leading-none ml-auto shrink-0">
                {cell.completions}/{cell.target}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 mt-1.5">
        {weekOffset > 0 && (
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            ← Newer
          </button>
        )}
        {history.length >= fetchDays - 7 && (
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors ml-auto"
          >
            Older →
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.met}`} />
          <span>Met</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.exceeded}`} />
          <span>Exceeded</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.missed}`} />
          <span>Missed</span>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-[10px] font-medium text-white bg-gray-900 rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
