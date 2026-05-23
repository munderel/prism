'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';

type User = {
  id: string;
  name: string | null;
  email: string;
};

type GoalAssignee = {
  user: { id: string; name: string | null };
};

type Goal = {
  id: string;
  title: string;
  level: string;
  assignees?: GoalAssignee[];
  isAssignedToMe?: boolean;
  stack?: { id: string; name: string; isCompany: boolean };
};

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export default function NewImproveTaskPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [goalId, setGoalId] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('MEDIUM');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/users');
        if (res.ok) setUsers(await res.json());
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setUsersLoading(false);
      }
    }
    async function fetchGoals() {
      try {
        // IMPROVE tasks must hang off WEEKLY goals (enforced by POST /api/tasks).
        // Pull personal-scope (owned + assigned) and company-scope WEEKLY goals
        // in parallel; keep only company goals the user is actually assigned to,
        // otherwise checkStackWriteAccess will 403 on submit.
        const [personalRes, companyRes] = await Promise.all([
          fetch('/api/goals?level=WEEKLY'),
          fetch('/api/goals?isCompany=true&level=WEEKLY'),
        ]);
        const personal: Goal[] = personalRes.ok ? await personalRes.json() : [];
        const companyAll: Goal[] = companyRes.ok ? await companyRes.json() : [];
        const company = companyAll.filter((g) => g.isAssignedToMe);
        const merged = [...personal, ...company].filter(
          (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i,
        );
        setGoals(merged);
      } catch {
        // optional
      } finally {
        setGoalsLoading(false);
      }
    }
    fetchUsers();
    fetchGoals();
  }, []);

  // Auto-assign from goal's responsible person when goal is selected
  useEffect(() => {
    if (!goalId) return;
    const selected = goals.find((g) => g.id === goalId);
    const firstAssignee = selected?.assignees?.[0]?.user?.id;
    if (firstAssignee) setAssigneeId(firstAssignee);
  }, [goalId, goals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        taskType: 'IMPROVE',
        title,
        priority,
        estimatedMinutes,
      };
      if (description) body.description = description;
      if (dueDate) body.dueDate = dueDate;
      if (goalId) body.goalId = goalId;
      if (assigneeId) body.assigneeId = assigneeId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create improve task');
      }

      router.push(goalId ? `/goals?goalId=${goalId}` : '/goals');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';
  const textareaClass = `${inputClass} resize-none`;
  const selectClass = inputClass;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Target className="h-6 w-6 text-indigo-400" />
          Create an Improve Task
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Improve tasks move a specific goal forward. Pick the goal you&apos;re working on.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Linked Goal <span className="text-red-400">*</span>
          </label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            required
            disabled={goalsLoading}
            className={selectClass}
          >
            <option value="">
              {goalsLoading
                ? 'Loading goals…'
                : goals.length === 0
                  ? 'No weekly goals available — create one first'
                  : '-- Select a weekly goal --'}
            </option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.stack?.name ? `${goal.stack.name} · ${goal.title}` : goal.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Task title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
            placeholder='e.g., "Draft Q3 onboarding outline"'
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Description <span className="text-xs text-[var(--text-muted)]">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={textareaClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof PRIORITIES[number])}
              className={selectClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Estimated minutes</label>
            <input
              type="number"
              min={1}
              max={9600}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={selectClass}
              disabled={usersLoading}
            >
              <option value="">
                {usersLoading ? 'Loading…' : '-- Unassigned --'}
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !goalId}
            className="rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110"
            style={{ background: 'var(--prism-gradient)' }}
          >
            {saving ? 'Creating…' : 'Create Improve Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
