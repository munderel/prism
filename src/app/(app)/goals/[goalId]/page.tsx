'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ChevronLeft, Target } from 'lucide-react';
import { formatDateOnly } from '@/lib/date-utils';
import GoalActivityHeatmap from '@/components/goals/GoalActivityHeatmap';

interface ParentSummary {
  id: string;
  title: string;
  level: string;
  parent?: ParentSummary | null;
}

interface GoalDetail {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  progressPct: number;
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  stack: { id: string; name: string };
  children: { id: string; title: string; level: string; status: string }[];
  tasks: { id: string; status: string; title: string }[];
  parent?: ParentSummary | null;
}

const LEVEL_LABEL: Record<string, string> = {
  HIGH_HARD: 'High Hard',
  STRATEGIC: 'Strategic',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
};

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: 'text-[var(--text-muted)]',
  IN_PROGRESS: 'text-indigo-400',
  COMPLETED: 'text-emerald-400',
  ABANDONED: 'text-red-400',
};

export default function GoalDetailPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const { data: goal, error, isLoading } = useSWR<GoalDetail>(
    `/api/goals/${goalId}?includeParents=true`
  );

  if (isLoading) {
    return <div className="text-[var(--text-muted)] py-12 text-center">Loading goal…</div>;
  }
  if (error || !goal) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-[var(--text-muted)]">Goal not found or you don&apos;t have access.</p>
        <Link href="/goals" className="text-indigo-400 hover:underline text-sm">← Back to goal stacks</Link>
      </div>
    );
  }

  const parents = collectParents(goal.parent);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          {goal.stack.name}
        </Link>
        {parents.length > 0 && (
          <nav className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)] flex-wrap">
            {parents.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                <Link
                  href={`/goals/${p.id}`}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  {p.title}
                </Link>
                {i < parents.length - 1 && <span>›</span>}
              </span>
            ))}
          </nav>
        )}
      </div>

      <header className="glass-panel p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Target className="h-6 w-6 text-prism-indigo shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] leading-tight">
              {goal.title}
            </h1>
            {goal.description && (
              <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                {goal.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span className="rounded bg-indigo-500/15 text-indigo-300 px-2 py-0.5 font-medium">
            {LEVEL_LABEL[goal.level] ?? goal.level}
          </span>
          <span className={`font-medium ${STATUS_COLOR[goal.status] ?? ''}`}>{goal.status.replace('_', ' ')}</span>
          {goal.dueDate && (
            <span className="text-[var(--text-muted)]">Due {formatDateOnly(goal.dueDate)}</span>
          )}
          {goal.startDate && goal.endDate && (
            <span className="text-[var(--text-muted)]">
              {formatDateOnly(goal.startDate)} → {formatDateOnly(goal.endDate)}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Progress</span>
            <span>{Math.round(goal.progressPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-prism-indigo transition-all"
              style={{ width: `${Math.min(100, Math.max(0, goal.progressPct))}%` }}
            />
          </div>
        </div>
      </header>

      <section className="glass-panel p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Activity</h2>
        <p className="text-xs text-[var(--text-muted)]">Task completions over the last 12 weeks.</p>
        <GoalActivityHeatmap goalId={goal.id} />
      </section>

      {goal.children.length > 0 && (
        <section className="glass-panel p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sub-goals</h2>
          <ul className="space-y-1.5">
            {goal.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/goals/${child.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <span className="text-[9px] text-[var(--text-muted)] rounded bg-white/5 px-1.5 py-0.5">
                    {LEVEL_LABEL[child.level] ?? child.level}
                  </span>
                  <span className="truncate flex-1">{child.title}</span>
                  <span className={`text-[10px] ${STATUS_COLOR[child.status] ?? ''}`}>
                    {child.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {goal.tasks.length > 0 && (
        <section className="glass-panel p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Tasks <span className="text-[var(--text-muted)] font-normal">({goal.tasks.length})</span>
          </h2>
          <ul className="space-y-1">
            {goal.tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`text-[10px] rounded px-1.5 py-0.5 ${
                    task.status === 'DONE'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-white/5 text-[var(--text-muted)]'
                  }`}
                >
                  {task.status}
                </span>
                <span
                  className={
                    task.status === 'DONE'
                      ? 'text-[var(--text-muted)] line-through'
                      : 'text-[var(--text-secondary)]'
                  }
                >
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function collectParents(parent: ParentSummary | null | undefined): ParentSummary[] {
  const out: ParentSummary[] = [];
  let p = parent;
  while (p) {
    out.unshift(p);
    p = p.parent;
  }
  return out;
}
