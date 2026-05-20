'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2, Target, Clock, CheckSquare, ExternalLink, Users } from 'lucide-react';
import useSWR, { mutate } from 'swr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClearGoalRow {
  key: string;
  /** Set for goals that already exist on the server. Undefined for new ones. */
  serverId?: string;
  text: string;
  isComplete: boolean;
}

export interface WorkBlockShape {
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  completionStatus: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';
  actualMinutes: number | null;
  notes: string | null;
  clearGoals?: Array<{ id: string; text: string; isComplete: boolean }>;
  task?: {
    id: string;
    title: string;
    estimatedMinutes?: number | null;
    goal?: { id: string; title: string } | null;
  } | null;
}

export interface WorkBlockEditorProps {
  workBlock: WorkBlockShape;
  fullPage?: boolean;
  onSave?: () => void;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDatetimeLocal(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  // Build a local datetime-local value without timezone shift.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromDatetimeLocal(value: string): string {
  // Parse as local time and convert to ISO.
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return '';
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const COMPLETION_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'MISSED', label: 'Missed' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkBlockEditor({ workBlock, fullPage = false, onSave, onClose }: WorkBlockEditorProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mainObjective, setMainObjective] = useState('');
  const [clearGoals, setClearGoals] = useState<ClearGoalRow[]>([]);
  const [actualMinutes, setActualMinutes] = useState<string>('');
  const [completionStatus, setCompletionStatus] = useState<'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED'>('PENDING');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite teammates — lazy-fetch users only when the section is opened so the
  // editor doesn't issue a /api/users request on every mount.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUserIds, setInviteUserIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const { data: allUsers } = useSWR<{ id: string; name: string | null; email: string }[]>(
    inviteOpen ? '/api/users' : null,
  );

  // Seed form when workBlock data arrives/changes.
  useEffect(() => {
    if (!workBlock) return;
    setStart(workBlock.start ? toDatetimeLocal(workBlock.start) : '');
    setEnd(workBlock.end ? toDatetimeLocal(workBlock.end) : '');
    setMainObjective(workBlock.mainObjective ?? '');
    setClearGoals(
      (workBlock.clearGoals ?? []).map((g: any) => ({
        key: g.id,
        serverId: g.id,
        text: g.text ?? '',
        isComplete: g.isComplete ?? false,
      }))
    );
    setActualMinutes(workBlock.actualMinutes != null ? String(workBlock.actualMinutes) : '');
    setCompletionStatus(workBlock.completionStatus ?? 'PENDING');
    setNotes(workBlock.notes ?? '');
  }, [workBlock]);

  if (!workBlock) return null;

  const task = workBlock.task ?? null;
  const goal = task?.goal ?? null;
  const estimatedMinutes: number | null = task?.estimatedMinutes ?? null;

  // Clear-goals helpers
  const addClearGoal = () =>
    setClearGoals((prev) => [
      ...prev,
      { key: crypto.randomUUID(), text: '', isComplete: false },
    ]);

  const updateClearGoalText = (key: string, text: string) =>
    setClearGoals((prev) =>
      prev.map((row) => (row.key === key ? { ...row, text } : row))
    );

  // Note: isComplete is UI-only here. The PATCH route accepts clearGoals as
  // a `string[]` (text-only, rewrite-on-save). Persisting per-goal completion
  // belongs in Component 15 (completion logging) when the work-block review
  // surface is built. The checkbox here is informational at edit time.
  const toggleClearGoalDone = (key: string) =>
    setClearGoals((prev) =>
      prev.map((row) => (row.key === key ? { ...row, isComplete: !row.isComplete } : row))
    );

  const removeClearGoal = (key: string) =>
    setClearGoals((prev) => prev.filter((row) => row.key !== key));

  const handleSave = async () => {
    setError(null);
    if (!mainObjective.trim()) {
      setError('Main objective is required.');
      return;
    }

    const startIso = fromDatetimeLocal(start);
    const endIso = fromDatetimeLocal(end);
    if (!startIso || !endIso) {
      setError('Enter valid start and end date/time.');
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError('End must be after start.');
      return;
    }

    const body: Record<string, unknown> = {
      start: startIso,
      end: endIso,
      mainObjective: mainObjective.trim(),
      completionStatus,
      notes: notes.trim() || null,
      clearGoals: clearGoals
        .map((r) => r.text.trim())
        .filter((t) => t.length > 0),
    };

    const parsedActual = actualMinutes.trim() !== '' ? parseInt(actualMinutes, 10) : null;
    body.actualMinutes = Number.isNaN(parsedActual) ? null : parsedActual;

    setSaving(true);
    try {
      const res = await fetch(`/api/work-blocks/${workBlock.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error ?? 'Failed to save.');
      }
      // Invalidate calendar + specific block.
      await mutate('/api/calendar');
      await mutate(`/api/work-blocks/${workBlock.id}`);
      onSave?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (inviteUserIds.length === 0) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      const res = await fetch(`/api/work-blocks/${workBlock.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: inviteUserIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Failed to send invitations.');
      }
      setInviteUserIds([]);
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'An error occurred.');
    } finally {
      setInviting(false);
    }
  };

  // When used inline (fullPage=false), still render the same content without
  // modal chrome. When fullPage=true, same — the edit page provides the page frame.
  return (
    <div className={fullPage ? 'space-y-6' : 'space-y-4'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-indigo-400 shrink-0" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Edit Work Block</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Read-only: Linked task & goal */}
      <div className="rounded-lg border border-[var(--border-color)] bg-white/5 px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)] shrink-0">Task:</span>
          {task ? (
            <Link
              href={`/tasks/${task.id}/edit`}
              className="inline-flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300 transition-colors truncate"
            >
              {task.title}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </Link>
          ) : (
            <span className="text-[var(--text-muted)] italic">No linked task</span>
          )}
        </div>
        {goal && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)] shrink-0">Goal:</span>
            <span className="text-[var(--text-secondary)] truncate">{goal.title}</span>
          </div>
        )}
      </div>

      {/* Start / End */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
            Start
          </label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
            End
          </label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
          />
        </div>
      </div>

      {/* Main objective */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Main objective <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={mainObjective}
          onChange={(e) => setMainObjective(e.target.value)}
          placeholder="What must happen in this block?"
          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
        />
      </div>

      {/* Clear goals */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
          <CheckSquare className="inline h-3.5 w-3.5 mr-1" />
          Clear goals
        </label>
        <div className="space-y-1.5">
          {clearGoals.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.isComplete}
                onChange={() => toggleClearGoalDone(row.key)}
                className="h-4 w-4 rounded accent-indigo-500 shrink-0"
                title="Reflect-time only — completion is logged in the post-block review (Powerdown / Weekly Review)"
              />
              <input
                type="text"
                value={row.text}
                onChange={(e) => updateClearGoalText(row.key, e.target.value)}
                placeholder="A concrete win for this block"
                className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
              />
              <button
                onClick={() => removeClearGoal(row.key)}
                className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addClearGoal}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add clear goal
          </button>
        </div>
      </div>

      {/* Actual minutes vs estimated */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
          <Clock className="inline h-3.5 w-3.5 mr-1" />
          Actual minutes
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={actualMinutes}
            onChange={(e) => setActualMinutes(e.target.value)}
            placeholder="—"
            min={0}
            max={480}
            step={5}
            className="w-28 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
          />
          {estimatedMinutes != null && (
            <span className="text-xs text-[var(--text-muted)]">
              Estimated: {estimatedMinutes}m
            </span>
          )}
        </div>
      </div>

      {/* Completion status */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Completion status
        </label>
        <select
          value={completionStatus}
          onChange={(e) =>
            setCompletionStatus(e.target.value as typeof completionStatus)
          }
          className="w-full max-w-xs rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
        >
          {COMPLETION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any notes about this session…"
          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 resize-none"
        />
      </div>

      {/* Invite teammates — collapsed by default so we don't fetch /api/users
          for every WorkBlockEditor mount. */}
      <div>
        <button
          type="button"
          onClick={() => setInviteOpen((open) => !open)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1 hover:text-[var(--text-primary)]"
        >
          <Users className="inline h-3.5 w-3.5" />
          Invite teammates
          <span className="ml-1 text-[10px] normal-case">{inviteOpen ? '▾' : '▸'}</span>
        </button>
        {inviteOpen && (
          <div className="space-y-2">
            <select
              multiple
              value={inviteUserIds}
              onChange={(e) =>
                setInviteUserIds(Array.from(e.target.selectedOptions, (o) => o.value))
              }
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
              size={Math.min(4, (allUsers?.length ?? 0) + 1)}
            >
              {(allUsers ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInvite}
                disabled={inviting || inviteUserIds.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {inviting && <Loader2 className="h-3 w-3 animate-spin" />}
                Send invite{inviteUserIds.length > 1 ? 's' : ''}
              </button>
              {inviteSuccess && (
                <span className="text-xs text-emerald-400">Invitations sent!</span>
              )}
            </div>
            {inviteError && (
              <p className="text-xs text-red-400">{inviteError}</p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onClose && (
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !mainObjective.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save block
        </button>
      </div>
    </div>
  );
}
