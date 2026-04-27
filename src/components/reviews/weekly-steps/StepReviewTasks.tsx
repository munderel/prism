'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightCircle, CheckCircle2, ListTodo, Loader2, XCircle } from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';
import { getPriorityBadgeClass } from '../shared/review-types';
import { useToast } from '@/components/ui/ToastProvider';

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string;
  taskType: string;
  goal?: { id: string; title: string } | null;
}

export interface ReviewTasksSummary {
  doneIds: string[];
  abandonedIds: string[];
  carriedForwardIds: string[];
  totalCount: number;
}

interface StepReviewTasksProps {
  isTeamReview?: boolean;
  onSummaryChange?: (summary: ReviewTasksSummary) => void;
}

interface GoalGroup {
  goalId: string | null;
  goalTitle: string;
  tasks: Task[];
}

async function getWeekStartDay(): Promise<number> {
  try {
    const res = await fetch('/api/stacks');
    if (res.ok) {
      const stacks = await res.json();
      const personal = Array.isArray(stacks) ? stacks.find((s: { isCompany?: boolean }) => !s.isCompany) : null;
      if (personal?.weekStartDay !== undefined) return personal.weekStartDay;
    }
  } catch { /* fall through */ }
  return 1;
}

function lastWeekRange(weekStartDay: number, now = new Date()): { start: string; end: string } {
  const dow = now.getDay();
  const diff = (dow - weekStartDay + 7) % 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - diff);
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);
  return { start: getLocalDateString(lastWeekStart), end: getLocalDateString(lastWeekEnd) };
}

function groupByGoal(tasks: Task[]): GoalGroup[] {
  const map = new Map<string, GoalGroup>();
  for (const t of tasks) {
    const key = t.goal?.id ?? '__none__';
    const title = t.goal?.title ?? 'Unlinked Tasks';
    let group = map.get(key);
    if (!group) {
      group = { goalId: t.goal?.id ?? null, goalTitle: title, tasks: [] };
      map.set(key, group);
    }
    group.tasks.push(t);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.goalId === null) return 1;
    if (b.goalId === null) return -1;
    return a.goalTitle.localeCompare(b.goalTitle);
  });
}

function summarize(tasks: Task[]): ReviewTasksSummary {
  const doneIds: string[] = [];
  const abandonedIds: string[] = [];
  const carriedForwardIds: string[] = [];
  for (const t of tasks) {
    if (t.status === 'DONE') doneIds.push(t.id);
    else if (t.status === 'DROPPED') abandonedIds.push(t.id);
    else carriedForwardIds.push(t.id);
  }
  return { doneIds, abandonedIds, carriedForwardIds, totalCount: tasks.length };
}

export function StepReviewTasks({ isTeamReview, onSummaryChange }: StepReviewTasksProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());

  // Stable ref so the publish-to-parent effect doesn't re-fire on every parent render
  const onSummaryChangeRef = useRef(onSummaryChange);
  useEffect(() => { onSummaryChangeRef.current = onSummaryChange; }, [onSummaryChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const weekStartDay = await getWeekStartDay();
        const { start, end } = lastWeekRange(weekStartDay);
        const scopeParam = isTeamReview ? '&scope=company' : '&scope=individual';
        const res = await fetch(`/api/tasks?startDate=${start}&endDate=${end}${scopeParam}`);
        if (!res.ok) {
          if (!cancelled) {
            toast.error("Couldn't load last week's tasks.");
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setTasks(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        console.error('[StepReviewTasks] fetch failed:', err);
        if (!cancelled) {
          toast.error("Couldn't load last week's tasks.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isTeamReview, toast]);

  const summary = useMemo(() => summarize(tasks), [tasks]);

  useEffect(() => {
    onSummaryChangeRef.current?.(summary);
  }, [summary]);

  const groups = useMemo(() => groupByGoal(tasks), [tasks]);

  const updateStatus = async (task: Task, newStatus: 'DONE' | 'DROPPED' | 'TODO') => {
    const prevStatus = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    setSavingIds((s) => {
      const next = new Set(s);
      next.add(task.id);
      return next;
    });
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`PATCH /api/tasks/${task.id} → ${res.status}`);
    } catch (err) {
      console.error('[StepReviewTasks] update failed:', err);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: prevStatus } : t)));
      toast.error("Couldn't update task — try again.");
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading last week&apos;s tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <ListTodo className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No tasks were due last week.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">Nothing to review — you can move on.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <ListTodo className="h-4 w-4" />
          <p className="text-sm">
            Your tasks from last week. Mark each done or abandoned. Anything you skip carries forward.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-xs">
          <span className="text-green-400">{summary.doneIds.length} done</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="text-red-400">{summary.abandonedIds.length} abandoned</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="text-amber-400">{summary.carriedForwardIds.length} carrying forward</span>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.goalId ?? '__none__'} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/40 to-transparent" />
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap">
              {group.goalTitle}
            </h3>
            <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/40 to-transparent" />
          </div>
          <div className="space-y-2">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                saving={savingIds.has(task.id)}
                onMarkDone={() => updateStatus(task, task.status === 'DONE' ? 'TODO' : 'DONE')}
                onAbandon={() => updateStatus(task, task.status === 'DROPPED' ? 'TODO' : 'DROPPED')}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  saving: boolean;
  onMarkDone: () => void;
  onAbandon: () => void;
}

function TaskRow({ task, saving, onMarkDone, onAbandon }: TaskRowProps) {
  const isDone = task.status === 'DONE';
  const isAbandoned = task.status === 'DROPPED';
  const isCarrying = !isDone && !isAbandoned;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
        ) : isDone ? (
          <CheckCircle2 className="h-5 w-5 text-green-400" />
        ) : isAbandoned ? (
          <XCircle className="h-5 w-5 text-red-400" />
        ) : (
          <ArrowRightCircle className="h-5 w-5 text-amber-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            isDone
              ? 'text-[var(--text-muted)] line-through'
              : isAbandoned
                ? 'text-[var(--text-muted)] line-through opacity-70'
                : 'text-[var(--text-primary)]'
          }`}
        >
          {task.title}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs ${getPriorityBadgeClass(task.priority)}`}>
            {task.priority}
          </span>
          {isCarrying && (
            <span className="text-xs text-amber-400/80">Will carry forward</span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onMarkDone}
          disabled={saving}
          aria-pressed={isDone}
          aria-label={isDone ? `Unmark ${task.title} done` : `Mark ${task.title} done`}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
            isDone
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'text-[var(--text-muted)] hover:bg-green-500/10 hover:text-green-400'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Done
        </button>
        <button
          type="button"
          onClick={onAbandon}
          disabled={saving}
          aria-pressed={isAbandoned}
          aria-label={isAbandoned ? `Unmark ${task.title} abandoned` : `Mark ${task.title} abandoned`}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
            isAbandoned
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400'
          }`}
        >
          <XCircle className="h-3.5 w-3.5" />
          Abandon
        </button>
      </div>
    </div>
  );
}
