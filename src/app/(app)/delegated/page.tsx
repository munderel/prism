'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { UserCog } from 'lucide-react';
import { formatDisplayDate } from '@/lib/date-utils';

interface DelegatedTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  taskType: string | null;
  dueDate: string | null;
  timeBlockStart: string | null;
  createdAt: string | null;
  completedAt: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string | null; email: string; image: string | null } | null;
  goal: { id: string; title: string; level: string; stack?: { name: string } } | null;
}

interface AssigneeGroup {
  assigneeId: string;
  name: string;
  email: string;
  tasks: DelegatedTask[];
}

const STATUS_TONE: Record<string, string> = {
  TODO: 'text-[var(--text-muted)]',
  IN_PROGRESS: 'text-prism-indigo',
  DONE: 'text-emerald-400',
  DROPPED: 'text-red-400',
};

type CompletionFilter = 'ALL' | 'ACTIVE' | 'COMPLETED';
type SortKey = 'PRIORITY' | 'DUE_DATE' | 'CREATED_DATE';

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function isCompleted(task: DelegatedTask): boolean {
  return task.status === 'DONE' || task.status === 'DROPPED' || !!task.completedAt;
}

export default function DelegatedPage() {
  // Any user can see the tasks THEY delegated (assigned away). The API scopes
  // `delegatedByMe` to ownerId = caller, so this is per-user and safe for all
  // roles — non-admins now see e.g. REACT tasks they routed to a teammate.
  const { data, isLoading } = useSWR<DelegatedTask[]>(
    '/api/tasks?delegatedByMe=true&includeUpcoming=true',
  );

  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('PRIORITY');

  const groups = useMemo<AssigneeGroup[]>(() => {
    if (!Array.isArray(data)) return [];

    const filtered = data.filter((task) => {
      if (!task.assignee || !task.assigneeId) return false;
      if (completionFilter === 'COMPLETED') return isCompleted(task);
      if (completionFilter === 'ACTIVE') return !isCompleted(task);
      return true;
    });

    const compare = (a: DelegatedTask, b: DelegatedTask): number => {
      switch (sortKey) {
        case 'DUE_DATE': {
          // Tasks without a due date sort last.
          const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case 'CREATED_DATE': {
          // Newest first.
          const av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bv - av;
        }
        case 'PRIORITY':
        default: {
          const ar = PRIORITY_RANK[a.priority ?? 'MEDIUM'] ?? 2;
          const br = PRIORITY_RANK[b.priority ?? 'MEDIUM'] ?? 2;
          if (ar !== br) return ar - br;
          // Tie-break by due date ascending.
          const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return ad - bd;
        }
      }
    };

    const byAssignee = new Map<string, AssigneeGroup>();
    for (const task of filtered) {
      const key = task.assigneeId as string;
      const name = task.assignee!.name ?? task.assignee!.email;
      const existing = byAssignee.get(key);
      if (existing) {
        existing.tasks.push(task);
      } else {
        byAssignee.set(key, { assigneeId: key, name, email: task.assignee!.email, tasks: [task] });
      }
    }
    const result = Array.from(byAssignee.values());
    for (const group of result) group.tasks.sort(compare);
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [data, completionFilter, sortKey]);

  const selectClass =
    'rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30';

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <UserCog className="h-6 w-6 text-prism-indigo" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Delegated</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
        Tasks you created and assigned to someone else. They no longer appear on your daily calendar — track them here.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          Show
          <select
            value={completionFilter}
            onChange={(e) => setCompletionFilter(e.target.value as CompletionFilter)}
            className={selectClass}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active (not completed)</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={selectClass}
          >
            <option value="PRIORITY">Priority</option>
            <option value="DUE_DATE">Due date</option>
            <option value="CREATED_DATE">Date created (newest)</option>
          </select>
        </label>
      </div>

      {isLoading && <div className="text-[var(--text-muted)] py-8 text-center">Loading delegated tasks…</div>}

      {!isLoading && groups.length === 0 && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-8 text-center text-[var(--text-muted)]">
          {completionFilter === 'ALL'
            ? "You haven't delegated any tasks yet."
            : 'No delegated tasks match this filter.'}
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.assigneeId}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--surface-raised)] flex items-center justify-between">
              <div>
                <h2 className="font-medium text-[var(--text-primary)]">{group.name}</h2>
                <p className="text-xs text-[var(--text-muted)]">{group.email}</p>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul className="divide-y divide-[var(--border-color)]">
              {group.tasks.map((task) => (
                <li key={task.id} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)] font-medium truncate">{task.title}</p>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-[var(--text-muted)]">
                      <span className={STATUS_TONE[task.status] ?? 'text-[var(--text-muted)]'}>
                        {task.status.replace('_', ' ').toLowerCase()}
                      </span>
                      {task.priority && <span>{task.priority.toLowerCase()}</span>}
                      {task.goal && <span className="text-indigo-400 truncate">{task.goal.title}</span>}
                      {task.createdAt && <span>created {formatDisplayDate(task.createdAt)}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] text-right flex-shrink-0">
                    {task.dueDate ? `Due ${formatDisplayDate(task.dueDate)}` : 'No due date'}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
