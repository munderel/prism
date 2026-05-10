'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { UserCog, AlertTriangle } from 'lucide-react';
import { formatDisplayDate } from '@/lib/date-utils';

interface DelegatedTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  taskType: string | null;
  dueDate: string | null;
  timeBlockStart: string | null;
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

export default function DelegatedPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;

  const { data, isLoading } = useSWR<DelegatedTask[]>(
    isAdmin ? '/api/tasks?delegatedByMe=true&includeUpcoming=true' : null,
  );

  const groups = useMemo<AssigneeGroup[]>(() => {
    if (!Array.isArray(data)) return [];
    const byAssignee = new Map<string, AssigneeGroup>();
    for (const task of data) {
      if (!task.assignee || !task.assigneeId) continue;
      const key = task.assigneeId;
      const existing = byAssignee.get(key);
      const name = task.assignee.name ?? task.assignee.email;
      if (existing) {
        existing.tasks.push(task);
      } else {
        byAssignee.set(key, {
          assigneeId: key,
          name,
          email: task.assignee.email,
          tasks: [task],
        });
      }
    }
    return Array.from(byAssignee.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  if (sessionStatus === 'loading') {
    return <div className="text-[var(--text-muted)] py-8 text-center">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-12 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="font-display text-lg font-semibold text-[var(--text-primary)]">Admins only</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            The Delegated view shows tasks you created and routed to other assignees. Ask an admin if you need access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <UserCog className="h-6 w-6 text-prism-indigo" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Delegated</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
        Tasks you created and assigned to someone else. They no longer appear on your daily calendar — track them here.
      </p>

      {isLoading && <div className="text-[var(--text-muted)] py-8 text-center">Loading delegated tasks…</div>}

      {!isLoading && groups.length === 0 && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-8 text-center text-[var(--text-muted)]">
          You haven&apos;t delegated any tasks yet.
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
