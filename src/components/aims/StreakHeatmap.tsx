'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface DayEntry {
  date: string;
  scheduled: boolean;
  completed: boolean;
}

interface StreakHeatmapProps {
  aimCategoryId: string;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StreakHeatmap({ aimCategoryId }: StreakHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { data: history } = useSWR<DayEntry[]>(
    `/api/aims/streak-history?aimCategoryId=${aimCategoryId}&days=56`
  );

  if (!history || history.length === 0) return null;

  // Organize data into a grid: 7 rows (days of week) x 8 columns (weeks)
  // We need to align so that the grid starts on a Sunday
  const firstDate = new Date(history[0].date + 'T00:00:00');
  const firstDayOfWeek = firstDate.getDay(); // 0=Sun

  // Pad the beginning with empty entries if needed
  const paddedHistory: (DayEntry | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    paddedHistory.push(null);
  }
  paddedHistory.push(...history);

  // Build weeks (columns)
  const weeks: (DayEntry | null)[][] = [];
  for (let i = 0; i < paddedHistory.length; i += 7) {
    weeks.push(paddedHistory.slice(i, i + 7));
  }

  // Pad the last week if needed
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek.length < 7) {
    lastWeek.push(null);
  }

  function isDateInPast(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr + 'T00:00:00') < today;
  }

  function getEntryStatus(entry: DayEntry): 'completed' | 'missed' | 'scheduled' | 'off' {
    if (!entry.scheduled) return 'off';
    if (entry.completed) return 'completed';
    return isDateInPast(entry.date) ? 'missed' : 'scheduled';
  }

  const CELL_COLORS: Record<ReturnType<typeof getEntryStatus>, string> = {
    completed: 'bg-emerald-500',
    missed: 'bg-red-400/60',
    scheduled: 'bg-[var(--surface-raised)] ring-1 ring-[var(--border-color)]',
    off: 'bg-[var(--surface-raised)] opacity-30',
  };

  function getCellColor(entry: DayEntry | null): string {
    if (!entry) return 'bg-transparent';
    return CELL_COLORS[getEntryStatus(entry)];
  }

  const STATUS_LABELS: Record<ReturnType<typeof getEntryStatus>, string> = {
    completed: 'Completed',
    missed: 'Missed',
    scheduled: 'Scheduled',
    off: 'Not scheduled',
  };

  function getTooltipText(entry: DayEntry | null): string {
    if (!entry) return '';
    const formatted = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return `${formatted} - ${STATUS_LABELS[getEntryStatus(entry)]}`;
  }

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    entry: DayEntry | null
  ) => {
    if (!entry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: getTooltipText(entry),
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
    });
  };

  return (
    <div className="relative">
      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] mr-0.5">
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="w-3 h-3 flex items-center justify-center text-[8px] text-[var(--text-muted)] leading-none"
            >
              {i % 2 === 1 ? label : ''}
            </div>
          ))}
        </div>
        {/* Week columns */}
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex flex-col gap-[3px]">
            {week.map((entry, dayIdx) => (
              <div
                key={dayIdx}
                className={`w-3 h-3 rounded-[2px] cursor-default transition-colors ${getCellColor(entry)}`}
                onMouseEnter={(e) => handleMouseEnter(e, entry)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-[10px] font-medium text-white bg-gray-900 rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1.5 text-[9px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px] bg-emerald-500" />
          <span>Done</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px] bg-red-400/60" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px] bg-[var(--surface-raised)] opacity-30" />
          <span>Off</span>
        </div>
      </div>
    </div>
  );
}
