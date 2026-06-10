'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  addDays,
  formatDateOnly,
  getLocalDateString,
  startOfToday,
} from '@/lib/date-utils';
import { HEATMAP_COLORS } from '@/lib/prism-colors';

interface ActivityEntry {
  date: string;
  count: number;
}

interface Cell {
  dateKey: string;
  state: 'completed' | 'gold' | 'empty' | 'future';
  count: number;
}

interface GoalActivityHeatmapProps {
  goalId: string;
  /** Days of history to fetch (default 84 = 12 weeks). */
  days?: number;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export default function GoalActivityHeatmap({ goalId, days = 84 }: GoalActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { data: history, error, isLoading } = useSWR<ActivityEntry[]>(
    `/api/goals/${goalId}/activity?days=${days}`
  );

  if (isLoading) {
    return <div className="text-xs text-[var(--text-muted)] py-2">Loading activity…</div>;
  }
  if (error || !history) {
    return <div className="text-xs text-[var(--text-muted)] py-2">Activity unavailable.</div>;
  }

  const grid = buildGrid(history, days);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, cell: Cell) => {
    if (cell.state === 'empty' && cell.count === 0) {
      // Still show date for dim cells
    }
    const dateLabel = formatDateOnly(cell.dateKey, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
    const label = cell.state === 'future'
      ? 'Upcoming'
      : cell.count === 0
        ? 'No activity'
        : `${cell.count} task${cell.count === 1 ? '' : 's'} completed`;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text: `${dateLabel} — ${label}`, x: rect.left + rect.width / 2, y: rect.top - 4 });
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

      <div className="flex flex-col gap-[3px]">
        {grid.map((week, wIdx) => (
          <div key={wIdx} className="flex items-center gap-[3px]">
            <div className="w-3 shrink-0" />
            {week.map((cell, dIdx) => (
              <div
                key={dIdx}
                className={`w-3 h-3 rounded-[2px] cursor-default transition-colors ${HEATMAP_COLORS[cell.state]}`}
                onMouseEnter={(e) => handleMouseEnter(e, cell)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.completed}`} />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.gold}`} />
          <span>Peak</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-[1px] ${HEATMAP_COLORS.empty} border border-white/10`} />
          <span>Quiet</span>
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

/**
 * Build a 7-column grid of weeks covering the last `days` days.
 * Cells are 'gold' when the count equals the series max (and the max is ≥ 3 —
 * avoids painting every day gold on a sparsely-completed goal).
 */
function buildGrid(history: ActivityEntry[], days: number): Cell[][] {
  const today = startOfToday();
  const countsByDate = new Map(history.map((e) => [e.date, e.count]));
  const max = history.reduce((m, e) => Math.max(m, e.count), 0);
  const goldThreshold = max >= 3 ? max : Infinity;

  const weeks = Math.ceil(days / 7);
  // Sunday of the most-recent rendered week.
  const latestSunday = addDays(today, -today.getDay());

  const grid: Cell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const week: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(latestSunday, -(w * 7) + d);
      const key = getLocalDateString(cellDate);
      const isFuture = cellDate > today;
      const count = countsByDate.get(key) ?? 0;
      let state: Cell['state'];
      if (isFuture) state = 'future';
      else if (count === 0) state = 'empty';
      else if (count >= goldThreshold) state = 'gold';
      else state = 'completed';
      week.push({ dateKey: key, state, count });
    }
    grid.push(week);
  }
  return grid;
}
