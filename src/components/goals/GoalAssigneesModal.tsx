'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface AssigneeRow {
  id: string;
  user: UserRow;
}

interface GoalAssigneesModalProps {
  goalId: string;
  goalTitle: string;
  onClose: () => void;
}

function Avatar({ user, size = 'md' }: { user: UserRow; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-xs';
  const label = user.name ?? user.email;
  const initials =
    label.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') ||
    label[0]?.toUpperCase() ||
    '?';
  if (user.image) {
    return (
      <img src={user.image} alt={label} className={`${dim} rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`${dim} flex items-center justify-center rounded-full bg-indigo-500/60 font-semibold text-white`}
    >
      {initials}
    </span>
  );
}

export function GoalAssigneesModal({ goalId, goalTitle, onClose }: GoalAssigneesModalProps) {
  const [addingUserId, setAddingUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const assigneesKey = `/api/goals/${goalId}/assignees`;
  const { data: assigneesData, mutate: mutateAssignees } = useSWR<{ assignees: AssigneeRow[] }>(assigneesKey);
  const { data: usersList } = useSWR<UserRow[]>('/api/users');

  const assignees = assigneesData?.assignees ?? [];
  const assignedIds = new Set(assignees.map((a) => a.user.id));
  const availableUsers = (usersList ?? []).filter((u) => !assignedIds.has(u.id));

  // Bust the stack-tree cache so the avatar stack on the goal card refreshes.
  const refreshStacks = () => {
    void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/goals'));
  };

  const addAssignee = async () => {
    if (!addingUserId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(assigneesKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addingUserId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add assignee');
      }
      setAddingUserId('');
      await mutateAssignees();
      refreshStacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add assignee');
    } finally {
      setBusy(false);
    }
  };

  const removeAssignee = async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${assigneesKey}/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove assignee');
      }
      await mutateAssignees();
      refreshStacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove assignee');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md glass-panel p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Goal Assignees
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5" title={goalTitle}>
                {goalTitle}
              </p>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="space-y-2">
            {assignees.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic py-2">
                No assignees. This goal has no individual owner (default).
              </p>
            ) : (
              assignees.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] px-3 py-2"
                >
                  <Avatar user={a.user} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {a.user.name ?? a.user.email}
                    </p>
                    {a.user.name && (
                      <p className="text-xs text-[var(--text-muted)] truncate">{a.user.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeAssignee(a.user.id)}
                    disabled={busy}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400 disabled:opacity-50"
                    title="Remove assignee"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {availableUsers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Add assignee</label>
              <div className="flex gap-2">
                <select
                  value={addingUserId}
                  onChange={(e) => setAddingUserId(e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select user…</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addAssignee}
                  disabled={!addingUserId || busy}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          )}
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
