'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Check } from 'lucide-react';
import { PRIORITY_DOT_COLORS } from '@/lib/goal-constants';
import { getLocalDateString, toLocalDateKey, eachLocalDateInRange } from '@/lib/date-utils';

// ── helpers ──────────────────────────────────────────────────────────
const toDateStr = getLocalDateString;

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateHeader(dateStr: string, todayStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const tomorrowStr = toDateStr(addDays(new Date(todayStr + 'T00:00:00'), 1));

  if (dateStr === todayStr) {
    return `Today, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  }
  if (dateStr === tomorrowStr) {
    return `Tomorrow, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── constants ────────────────────────────────────────────────────────
const TASK_TYPE_BORDER: Record<string, string> = {
  IMPROVE: 'border-l-indigo-500',
  REACT: 'border-l-yellow-500',
  MAINTENANCE: 'border-l-cyan-500',
};

const TASK_TYPE_BADGE_STYLE: Record<string, string> = {
  IMPROVE: 'bg-indigo-100 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-600/30',
  REACT: 'bg-yellow-100 dark:bg-yellow-600/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-600/30',
  MAINTENANCE: 'bg-cyan-100 dark:bg-cyan-600/20 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-600/30',
};

const TASK_TYPE_LABEL: Record<string, string> = {
  IMPROVE: 'Improve',
  REACT: 'React',
  MAINTENANCE: 'Maintenance',
};

// ── types ────────────────────────────────────────────────────────────
interface AgendaViewProps {
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onStatusChange?: () => void;
}

// ── component ────────────────────────────────────────────────────────
export function AgendaView({ onEdit, onDelete, onClick, onStatusChange }: AgendaViewProps) {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const todayDate = useMemo(() => new Date(todayStr + 'T00:00:00'), [todayStr]);

  // Fetch 14 days starting today
  const endStr = useMemo(() => toDateStr(addDays(todayDate, 13)), [todayDate]);
  const swrKey = `/api/tasks?startDate=${todayStr}&endDate=${endStr}`;
  const { data, isLoading, mutate } = useSWR(swrKey);

  // Also fetch overdue tasks (past tasks that are not done/dropped)
  // Use a wide lookback — 90 days should catch everything relevant
  const overdueStartStr = useMemo(() => toDateStr(addDays(todayDate, -90)), [todayDate]);
  const yesterdayStr = useMemo(() => toDateStr(addDays(todayDate, -1)), [todayDate]);
  const overdueKey = `/api/tasks?startDate=${overdueStartStr}&endDate=${yesterdayStr}`;
  const { data: overdueData, mutate: mutateOverdue } = useSWR(overdueKey);

  const allTasks: any[] = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const pastTasks: any[] = useMemo(() => (Array.isArray(overdueData) ? overdueData : []), [overdueData]);

  // Overdue = past tasks that are not DONE or DROPPED
  const overdueTasks = useMemo(
    () => pastTasks.filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED'),
    [pastTasks],
  );

  // Group future/today tasks by date. Tasks with both startTime and dueDate
  // appear in every bucket between them (clamped to the visible window).
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const task of allTasks) {
      const dueKey = task.dueDate ? toLocalDateKey(task.dueDate) : null;
      const startKey = task.startTime ? toLocalDateKey(task.startTime) : null;

      let keys: string[];
      if (startKey && dueKey) {
        const clampedStart = startKey < todayStr ? todayStr : startKey;
        const clampedEnd = dueKey > endStr ? endStr : dueKey;
        keys = eachLocalDateInRange(clampedStart, clampedEnd);
      } else if (dueKey) {
        keys = [dueKey];
      } else {
        keys = [todayStr];
      }

      for (const key of keys) {
        if (!groups[key]) groups[key] = [];
        groups[key].push(task);
      }
    }
    return groups;
  }, [allTasks, todayStr, endStr]);

  // Build ordered date keys for the 14 days
  const dateKeys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < 14; i++) {
      keys.push(toDateStr(addDays(todayDate, i)));
    }
    return keys;
  }, [todayDate]);

  // Optimistic status toggle
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});

  const toggleStatus = useCallback(
    async (task: any) => {
      const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
      // Optimistic update
      setOptimisticStatuses((prev) => ({ ...prev, [task.id]: newStatus }));

      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error('Failed');
        // Update SWR caches inline (no server refetch) to avoid flicker
        const updater = (current: any[] | undefined) =>
          (Array.isArray(current) ? current : []).map((t: any) =>
            t.id === task.id ? { ...t, status: newStatus } : t
          );
        mutate(updater, { revalidate: false });
        mutateOverdue(updater, { revalidate: false });
        // Clear optimistic state — real data is now in cache
        setOptimisticStatuses((prev) => {
          const copy = { ...prev };
          delete copy[task.id];
          return copy;
        });
        onStatusChange?.();
      } catch {
        // Revert on error
        setOptimisticStatuses((prev) => {
          const copy = { ...prev };
          delete copy[task.id];
          return copy;
        });
      }
    },
    [mutate, mutateOverdue, onStatusChange],
  );

  const getEffectiveStatus = useCallback(
    (task: any) => optimisticStatuses[task.id] ?? task.status,
    [optimisticStatuses],
  );

  // ── render helpers ───────────────────────────────────────────────
  const renderTask = (task: any) => {
    const effectiveStatus = getEffectiveStatus(task);
    const isDone = effectiveStatus === 'DONE';
    const borderColor = TASK_TYPE_BORDER[task.taskType] ?? 'border-l-gray-500';
    const priorityDot = PRIORITY_DOT_COLORS[task.priority] ?? PRIORITY_DOT_COLORS.MEDIUM;
    const badgeStyle = TASK_TYPE_BADGE_STYLE[task.taskType] ?? '';
    const badgeLabel = TASK_TYPE_LABEL[task.taskType] ?? task.taskType;

    return (
      <div
        key={task.id}
        className={`group flex items-center gap-3 px-4 py-2.5 border-l-[3px] ${borderColor} hover:bg-white/[0.03] transition-colors cursor-pointer ${
          isDone ? 'opacity-60' : ''
        }`}
        onClick={() => onClick?.(task)}
      >
        {/* Status toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStatus(task);
          }}
          className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors flex items-center justify-center ${
            isDone
              ? 'bg-green-600 border-green-600'
              : 'border-[var(--border-color)] hover:border-indigo-500'
          }`}
        >
          {isDone && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>

        {/* Priority dot */}
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDot}`} />

        {/* Time range */}
        {task.timeBlockStart && task.timeBlockEnd && (
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap min-w-[120px]">
            {formatTime(task.timeBlockStart)} - {formatTime(task.timeBlockEnd)}
          </span>
        )}

        {/* Title */}
        <span
          className={`text-sm font-medium truncate flex-1 ${
            isDone
              ? 'text-[var(--text-muted)] line-through'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {task.title}
        </span>

        {/* Task type badge */}
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeStyle}`}
        >
          {badgeLabel}
        </span>

        {/* Assignee avatar */}
        {task.assignee?.image && (
          <img
            src={task.assignee.image}
            alt={task.assignee.name ?? ''}
            title={task.assignee.name ?? ''}
            className="h-5 w-5 rounded-full flex-shrink-0"
          />
        )}

        {/* Hover actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            title="Edit task"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400"
            title="Delete task"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // ── loading state ────────────────────────────────────────────────
  if (isLoading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading agenda...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Overdue section */}
      {overdueTasks.length > 0 && (
        <div className="glass-panel overflow-hidden border-red-500/30">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border-b border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">
              Overdue
            </span>
            <span className="text-xs text-red-400/70">({overdueTasks.length})</span>
          </div>
          <div className="divide-y divide-[var(--border-color)]">
            {overdueTasks.map(renderTask)}
          </div>
        </div>
      )}

      {/* Date groups for next 14 days */}
      {dateKeys.map((dateKey) => {
        const dayTasks = grouped[dateKey] || [];
        const isToday = dateKey === todayStr;

        return (
          <div key={dateKey} className="glass-panel overflow-hidden">
            <div
              className={`flex items-center gap-2 px-4 py-3 border-b border-[var(--border-color)] ${
                isToday ? 'bg-indigo-500/10' : ''
              }`}
            >
              <span
                className={`text-sm font-semibold ${
                  isToday ? 'text-indigo-400' : 'text-[var(--text-secondary)]'
                }`}
              >
                {formatDateHeader(dateKey, todayStr)}
              </span>
              {isToday && (
                <span className="rounded bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400 border border-indigo-600/30">
                  Today
                </span>
              )}
              {dayTasks.length > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({dayTasks.length})</span>
              )}
            </div>

            {dayTasks.length === 0 ? (
              <div className="px-4 py-4 text-center">
                <span className="text-xs text-[var(--text-muted)]">No tasks scheduled</span>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {dayTasks.map(renderTask)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
