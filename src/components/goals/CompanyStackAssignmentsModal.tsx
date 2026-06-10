'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Building2 } from 'lucide-react';
import { getInitials } from '@/components/ui/Avatar';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface AssignmentRow {
  id: string;
  userId: string;
  assignedAt: string;
  notes: string | null;
  user: UserRow;
}

interface CompanyStackAssignmentsModalProps {
  goalStackId: string;
  stackName: string;
  onClose: () => void;
}

function Avatar({ user }: { user: UserRow }) {
  const label = user.name ?? user.email;
  if (user.image) {
    return <img src={user.image} alt={label} className="h-7 w-7 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/60 text-xs font-semibold text-white">
      {getInitials(label)}
    </span>
  );
}

export function CompanyStackAssignmentsModal({
  goalStackId,
  stackName,
  onClose,
}: CompanyStackAssignmentsModalProps) {
  const [addingUserId, setAddingUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const assignmentsKey = `/api/admin/company-goals/${goalStackId}/assignments`;
  const { data: assignmentsData, mutate: mutateAssignments } = useSWR<{ assignments: AssignmentRow[] }>(assignmentsKey);
  const { data: usersList } = useSWR<UserRow[]>('/api/users');

  const assignments = assignmentsData?.assignments ?? [];
  const assignedIds = new Set(assignments.map((a) => a.user.id));
  const availableUsers = (usersList ?? []).filter((u) => !assignedIds.has(u.id));

  const add = async () => {
    if (!addingUserId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(assignmentsKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addingUserId, notes: notes || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to assign user');
      }
      setAddingUserId('');
      setNotes('');
      await mutateAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign user');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${assignmentsKey}/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unassign user');
      }
      await mutateAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign user');
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
          className="w-full max-w-lg glass-panel p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-400" />
                Company Stack Assignments
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5" title={stackName}>
                {stackName}
              </p>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Assigned users see this stack&apos;s goals with an &quot;Assigned to you&quot; badge in their
            weekly review and can log progress. Unassigned users see the stack read-only.
          </p>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="space-y-2">
            {assignments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic py-2">No one assigned yet.</p>
            ) : (
              assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] px-3 py-2"
                >
                  <Avatar user={a.user} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {a.user.name ?? a.user.email}
                    </p>
                    {a.user.name && (
                      <p className="text-xs text-[var(--text-muted)] truncate">{a.user.email}</p>
                    )}
                    {a.notes && (
                      <p className="mt-0.5 text-xs italic text-[var(--text-muted)] truncate" title={a.notes}>
                        &ldquo;{a.notes}&rdquo;
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(a.user.id)}
                    disabled={busy}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400 disabled:opacity-50"
                    title="Unassign"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {availableUsers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border-color)] space-y-2">
              <label className="block text-sm text-[var(--text-secondary)]">Assign user</label>
              <select
                value={addingUserId}
                onChange={(e) => setAddingUserId(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select user…</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Optional notes (e.g. "owns customer acquisition slice")'
                maxLength={500}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={add}
                disabled={!addingUserId || busy}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Assign
              </button>
            </div>
          )}
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
