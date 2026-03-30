'use client';

import { Star, Trophy } from 'lucide-react';

interface WinTheDayTask {
  id: string;
  title: string;
  status: string;
  rank?: number; // 1 = most important, 2, 3
  clearGoal?: string;
  timeBlockStart?: string;
  timeBlockEnd?: string;
}

interface WinTheDayCardProps {
  /** Ranked top tasks from power-down (up to 3). First = most important. */
  tasks: WinTheDayTask[];
}

function formatTimeRange(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return m > 0 ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

export function WinTheDayCard({ tasks }: WinTheDayCardProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="glass-panel border-dashed border-amber-500/20 p-4 mb-6 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Star className="h-4 w-4" />
          <span className="text-sm">No top tasks selected yet. Complete a Power Down to set your priorities.</span>
        </div>
      </div>
    );
  }

  const topTask = tasks[0];
  const isTopDone = topTask.status === 'DONE';

  return (
    <div className="mb-6 space-y-2">
      {/* Primary: #1 Most Important */}
      <div className="glass-panel border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">
            Win The Day — Complete this one task and you&apos;ve won the day
          </span>
          {isTopDone && (
            <div className="ml-auto flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400">You Won the Day!</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-amber-400 bg-amber-400/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">1</span>
          <span className={`text-sm font-medium flex-1 ${isTopDone ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
            {topTask.title}
          </span>
          {topTask.clearGoal && (
            <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{topTask.clearGoal}</span>
          )}
          {(() => {
            const tr = formatTimeRange(topTask.timeBlockStart, topTask.timeBlockEnd);
            return tr ? <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{tr}</span> : null;
          })()}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1.5">
          This is your highest-leverage task. Everything else is bonus.
        </p>
      </div>

      {/* Secondary: #2 and #3 */}
      {tasks.slice(1).map((task, i) => {
        const rank = i + 2;
        const isDone = task.status === 'DONE';
        return (
          <div key={task.id} className="glass-panel border-[var(--border-color)] p-3 flex items-center gap-3">
            <span className="text-xs font-bold text-indigo-400 bg-indigo-400/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
              {rank}
            </span>
            <span className={`text-sm flex-1 ${isDone ? 'text-gray-500 line-through' : 'text-[var(--text-secondary)]'}`}>
              {task.title}
            </span>
            {task.clearGoal && (
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[180px]">{task.clearGoal}</span>
            )}
            {(() => {
              const tr = formatTimeRange(task.timeBlockStart, task.timeBlockEnd);
              return tr ? <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{tr}</span> : null;
            })()}
            {isDone && <span className="text-xs text-green-400">Done</span>}
          </div>
        );
      })}
    </div>
  );
}
