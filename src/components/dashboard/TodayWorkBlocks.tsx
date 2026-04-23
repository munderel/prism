'use client';

import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { Clock, Target, ChevronDown, ChevronRight } from 'lucide-react';
import { minutesBetween } from '@/lib/date-utils';

type BlockStatus = 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';

interface WorkBlock {
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  completionStatus: BlockStatus;
  actualMinutes: number | null;
  task: { id: string; title: string; estimatedMinutes: number | null };
  clearGoals: { id: string; text: string; isComplete: boolean }[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRange(startISO: string, endISO: string): string {
  const s = new Date(startISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const e = new Date(endISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${s}–${e}`;
}

/**
 * Roll up today's blocks per task. The underlying progress bar is an
 * approximation — only today's workblocks count. A task with prior-day
 * blocks will show understated progress here; the per-task page still has
 * the authoritative figure.
 */
function buildTaskProgress(blocks: WorkBlock[]): Map<string, { completed: number; estimated: number }> {
  const rollup = new Map<string, { completed: number; estimated: number }>();
  for (const b of blocks) {
    const current = rollup.get(b.task.id) ?? { completed: 0, estimated: b.task.estimatedMinutes ?? 0 };
    if (b.completionStatus === 'COMPLETED' || b.completionStatus === 'PARTIAL') {
      current.completed += b.actualMinutes ?? minutesBetween(b.start, b.end);
    }
    rollup.set(b.task.id, current);
  }
  return rollup;
}

export function TodayWorkBlocks() {
  const date = todayKey();
  // Pass the browser's IANA timezone so the server computes the day window in
  // the user's zone, not the server's local time (see /api/work-blocks).
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const swrKey = `/api/work-blocks?date=${date}&tz=${encodeURIComponent(tz)}`;
  const { data } = useSWR<WorkBlock[]>(swrKey, fetcher, { revalidateOnFocus: false });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const blocks = Array.isArray(data) ? data : [];
  const taskProgress = buildTaskProgress(blocks);

  if (blocks.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggle = async (block: WorkBlock) => {
    const next: BlockStatus = block.completionStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    await mutate(
      swrKey,
      (current?: WorkBlock[]) =>
        current ? current.map((b) => (b.id === block.id ? { ...b, completionStatus: next } : b)) : current,
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/work-blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionStatus: next }),
      });
      if (!res.ok) throw new Error('Failed to update block');
    } catch {
      // rollback by revalidating from server
    } finally {
      await mutate(swrKey);
    }
  };

  const toggleGoal = async (block: WorkBlock, goalId: string, nextState: boolean) => {
    // Optimistic update
    await mutate(
      swrKey,
      (current?: WorkBlock[]) =>
        current
          ? current.map((b) =>
              b.id === block.id
                ? { ...b, clearGoals: b.clearGoals.map((g) => (g.id === goalId ? { ...g, isComplete: nextState } : g)) }
                : b,
            )
          : current,
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/tasks/${block.task.id}/clear-goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: [{ id: goalId, isComplete: nextState }] }),
      });
      if (!res.ok) throw new Error('Failed to update goal');
    } catch {
      // rollback via revalidation
    } finally {
      await mutate(swrKey);
    }
  };

  return (
    <section className="glass-panel p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Today&apos;s Work Blocks</h3>
        <span className="text-xs text-[var(--text-muted)]">({blocks.length})</span>
      </div>
      <ul className="space-y-1.5">
        {blocks.map((block) => {
          const done = block.completionStatus === 'COMPLETED';
          const isOpen = expanded.has(block.id);
          const goalCount = block.clearGoals?.length ?? 0;
          const doneGoals = block.clearGoals?.filter((g) => g.isComplete).length ?? 0;
          const progress = taskProgress.get(block.task.id);
          const pct = progress && progress.estimated > 0
            ? Math.min(100, Math.round((progress.completed / progress.estimated) * 100))
            : 0;
          const barColor = progress && progress.completed > progress.estimated ? 'bg-orange-500' : 'bg-emerald-500';
          return (
            <li
              key={block.id}
              className={`rounded-md border border-[var(--border-color)] px-3 py-2 bg-background/40 ${done ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(block)}
                  className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
                    done ? 'bg-emerald-600 border-emerald-600' : 'border-[var(--border-color)] hover:border-emerald-500'
                  }`}
                  title={done ? 'Mark session as pending' : 'Mark session completed'}
                >
                  {done && (
                    <svg viewBox="0 0 20 20" className="h-full w-full text-white">
                      <path
                        fill="currentColor"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                      {block.mainObjective}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                      <Clock className="h-3 w-3" />
                      {formatRange(block.start, block.end)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">Task: {block.task.title}</p>
                  {progress && progress.estimated > 0 && (
                    <div
                      className="mt-1 h-1 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden"
                      title={`${progress.completed}m of ${progress.estimated}m estimate (today's blocks only)`}
                    >
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {goalCount > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(block.id)}
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <Target className="h-3 w-3" />
                      <span>{doneGoals} / {goalCount} sub-goals</span>
                    </button>
                  )}
                </div>
              </div>
              {isOpen && goalCount > 0 && (
                <div className="mt-2 ml-8 space-y-1">
                  {block.clearGoals.map((goal) => (
                    <label
                      key={goal.id}
                      className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={goal.isComplete}
                        onChange={(e) => toggleGoal(block, goal.id, e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-indigo-500"
                      />
                      <span className={goal.isComplete ? 'line-through text-[var(--text-muted)]' : ''}>
                        {goal.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[var(--text-muted)] mt-2">
        Checking a block marks only that work session as completed — the parent task stays open until you finish it.
      </p>
    </section>
  );
}
