'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateOnly } from '@/lib/date-utils';
import { isDayActive } from '@/lib/aim-streak-engine';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayLocalMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateFromKey(key: string): Date {
  return new Date(key + 'T00:00:00');
}

/** ISO year+week string, e.g. "2026-W20" — ISO weeks start Monday */
function isoWeekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dow);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Monday of a date's ISO week */
function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

/** Add days to a date, returns new Date */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Daily-mode grid builder ──────────────────────────────────────────────────

export interface DailyCell {
  dateKey: string;
  state: 'completed' | 'missed' | 'inactive' | 'future' | 'empty';
}

/**
 * Build a 7-column grid of weeks.
 * weekOffset=0 → most recent 8 weeks; weekOffset=8 → the 8 weeks before that.
 *
 * @internal Exported for unit tests only.
 */
export function buildDailyGrid(
  history: DayEntry[],
  activeWeekdays: number,
  weekOffset: number,
): DailyCell[][] {
  const today = todayLocalMidnight();
  const completedSet = new Set(history.filter((e) => e.completed).map((e) => e.date));

  // Find the Sunday that starts the most-recent week shown
  const latestSunday = new Date(today);
  latestSunday.setDate(today.getDate() - today.getDay() - weekOffset * 7);

  const weeks: DailyCell[][] = [];
  for (let w = PAGE_WEEKS - 1; w >= 0; w--) {
    const week: DailyCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(latestSunday, -(w * 7) + d);
      const key = localKey(cellDate);
      const dow = cellDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const active = isDayActive(activeWeekdays, dow);
      const isFuture = cellDate > today;

      let state: DailyCell['state'];
      if (!active) {
        // Inactive days are always dim — regardless of whether they are future.
        state = 'inactive';
      } else if (isFuture) {
        // Active but in the future → neutral, not missed.
        state = 'future';
      } else if (completedSet.has(key)) {
        state = 'completed';
      } else {
        state = 'missed';
      }
      week.push({ dateKey: key, state });
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Build a rolling 7-day strip ending today.
 * Returns 7 cells ordered oldest → newest (today is index 6).
 *
 * @internal Exported for unit tests only.
 */
export function buildLast7Days(
  history: DayEntry[],
  activeWeekdays: number,
): DailyCell[] {
  const today = todayLocalMidnight();
  const completedSet = new Set(history.filter((e) => e.completed).map((e) => e.date));

  const cells: DailyCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const cellDate = addDays(today, -i);
    const key = localKey(cellDate);
    const dow = cellDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const active = isDayActive(activeWeekdays, dow);

    let state: DailyCell['state'];
    if (!active) {
      state = 'inactive';
    } else if (completedSet.has(key)) {
      state = 'completed';
    } else {
      state = 'missed';
    }
    cells.push({ dateKey: key, state });
  }
  return cells;
}

/**
 * Single-letter weekday labels rotated so today is at index 6.
 * @internal Exported for unit tests only.
 */
export function rotatedDayLabels(todayDow: number): string[] {
  return Array.from({ length: 7 }, (_, i) => DAY_LABELS[(todayDow + i + 1) % 7]);
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
  const today = todayLocalMidnight();
  const thisWeekMonday = mondayOfWeek(today);

  // Count completions per ISO week
  const weekCounts = new Map<string, number>();
  for (const entry of history) {
    if (entry.completed) {
      const key = isoWeekKey(dateFromKey(entry.date));
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    }
  }

  const cells: WeekCell[] = [];
  for (let w = 0; w < PAGE_WEEKS; w++) {
    // Most recent week first (w=0) → subtract weekOffset pages
    const weekStart = addDays(thisWeekMonday, -(w + weekOffset * PAGE_WEEKS) * 7);
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

// ── Color maps ───────────────────────────────────────────────────────────────

const DAILY_COLORS: Record<DailyCell['state'], string> = {
  completed: 'bg-emerald-500',
  missed:    'bg-red-500/40',
  inactive:  'bg-white/5',
  future:    'bg-white/10',
  empty:     'bg-transparent',
};

const WEEKLY_COLORS: Record<WeekCell['state'], string> = {
  met:      'bg-emerald-500',
  exceeded: 'bg-amber-400',
  missed:   'bg-red-500/40',
  future:   'bg-white/5',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function StreakHeatmap({
  aimCategoryId,
  isDaily,
  activeWeekdays,
  weeklyTarget,
}: StreakHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);

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
    const stripCells = buildLast7Days(history, activeWeekdays);
    const stripLabels = rotatedDayLabels(todayLocalMidnight().getDay());

    const handleMouseEnterDaily = (e: React.MouseEvent<HTMLDivElement>, cell: DailyCell) => {
      if (cell.state === 'empty') return;
      const label = (() => {
        switch (cell.state) {
          case 'completed': return 'Completed';
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
        {/* Last-7-days strip — today on the right */}
        <div className="flex gap-1.5 justify-between">
          {stripCells.map((cell, i) => {
            const dayNum = dateFromKey(cell.dateKey).getDate();
            const isToday = i === 6;
            const isCompleted = cell.state === 'completed';
            const isInactive = cell.state === 'inactive';

            const boxBase = 'w-7 h-7 rounded-md flex items-center justify-center cursor-default transition-colors';
            const boxState = isInactive
              ? 'bg-white/5 border border-dashed border-white/10'
              : DAILY_COLORS[cell.state];
            const ringClass = isToday && !isCompleted ? 'ring-2 ring-emerald-400/50' : '';

            return (
              <div key={cell.dateKey} className="flex flex-col items-center gap-0.5">
                <div className={`text-[10px] leading-none ${isToday ? 'text-[var(--text-secondary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                  {stripLabels[i]}
                </div>
                <div className={`text-[9px] leading-none ${isToday ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
                  {dayNum}
                </div>
                <div
                  className={`${boxBase} ${boxState} ${ringClass}`}
                  onMouseEnter={(e) => handleMouseEnterDaily(e, cell)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {isCompleted && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* History toggle */}
        <button
          onClick={() => setHistoryExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {historyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{historyExpanded ? 'Hide history' : 'Show history'}</span>
        </button>

        {historyExpanded && (() => {
          const grid = buildDailyGrid(history, activeWeekdays, weekOffset);
          return (
            <div className="mt-2">
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
                    <div className="w-3 shrink-0" />
                    {week.map((cell, dIdx) => (
                      <div
                        key={dIdx}
                        className={`w-3 h-3 rounded-[2px] cursor-default transition-colors ${DAILY_COLORS[cell.state]}`}
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
                  <div className="w-2 h-2 rounded-[1px] bg-emerald-500" />
                  <span>Done</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-[1px] bg-red-500/40" />
                  <span>Missed</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-[1px] bg-white/5 border border-white/10" />
                  <span>Off</span>
                </div>
              </div>
            </div>
          );
        })()}

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
            className={`flex items-center gap-1.5 h-4 rounded-[3px] px-1.5 cursor-default transition-colors ${WEEKLY_COLORS[cell.state]}`}
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
          <div className="w-2 h-2 rounded-[1px] bg-emerald-500" />
          <span>Met</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px] bg-amber-400" />
          <span>Exceeded</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px] bg-red-500/40" />
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
