'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Split } from 'lucide-react';

interface SplitTaskModalProps {
  taskId: string;
  taskTitle: string;
  defaultDurationMinutes?: number;
  onClose: () => void;
  onSplit?: () => void;
}

interface SessionRow {
  title: string;
  durationMinutes: number;
}

export function SplitTaskModal({
  taskId,
  taskTitle,
  defaultDurationMinutes = 60,
  onClose,
  onSplit,
}: SplitTaskModalProps) {
  // Start with two empty rows. Users named subtasks inconsistently when we
  // pre-filled "Outline / Draft / Edit" because they forgot the placeholder
  // was a suggestion, not their text.
  const [sessions, setSessions] = useState<SessionRow[]>([
    { title: '', durationMinutes: defaultDurationMinutes },
    { title: '', durationMinutes: defaultDurationMinutes },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const addSession = () => {
    if (sessions.length >= 20) return;
    setSessions((prev) => [
      ...prev,
      { title: '', durationMinutes: defaultDurationMinutes },
    ]);
  };

  const removeSession = (idx: number) => {
    // The server requires at least 2 sessions, so disallow removing below 2.
    if (sessions.length <= 2) return;
    setSessions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSession = (idx: number, patch: Partial<SessionRow>) => {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const invalidReason = (() => {
    if (sessions.length < 2) return 'Add at least two sessions';
    if (sessions.some((s) => !s.title.trim())) return 'Each session needs a name';
    if (sessions.some((s) => !Number.isFinite(s.durationMinutes) || s.durationMinutes < 5))
      return 'Each session needs a duration ≥ 5 minutes';
    return null;
  })();

  const handleSplit = async () => {
    if (invalidReason) {
      setError(invalidReason);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/tasks/${taskId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: sessions.map((s) => ({
            title: s.title.trim(),
            durationMinutes: s.durationMinutes,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to split task');
      }
      onSplit?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to split task');
    } finally {
      setBusy(false);
    }
  };

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

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
                <Split className="h-4 w-4 text-indigo-400" />
                Split into Sessions
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5" title={taskTitle}>
                {taskTitle}
              </p>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Each session becomes a subtask under this one. You can drag each subtask onto the
            calendar individually. The parent stays as the deadline container.
          </p>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {sessions.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] px-3 py-2"
              >
                <span className="flex-shrink-0 text-xs font-semibold text-[var(--text-muted)] w-5 text-right">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={s.title}
                  onChange={(e) => updateSession(i, { title: e.target.value })}
                  placeholder={`Session ${i + 1}`}
                  className="flex-1 min-w-0 rounded border border-white/[0.08] bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={5}
                  max={1440}
                  step={5}
                  value={Number.isFinite(s.durationMinutes) ? s.durationMinutes : ''}
                  onChange={(e) => {
                    // Preserve NaN while the user is mid-type; the Save button's
                    // invalid-reason check will catch it. Don't silently snap to
                    // 60, which overrides the user's explicit clear.
                    const raw = e.target.value;
                    const n = raw === '' ? Number.NaN : Number(raw);
                    updateSession(i, { durationMinutes: n });
                  }}
                  className="w-20 flex-shrink-0 rounded border border-white/[0.08] bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-[var(--text-muted)] flex-shrink-0">min</span>
                <button
                  onClick={() => removeSession(i)}
                  disabled={sessions.length <= 2}
                  className="flex-shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400 disabled:opacity-50"
                  title={sessions.length <= 2 ? 'At least two sessions required' : 'Remove session'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <button
              onClick={addSession}
              disabled={sessions.length >= 20}
              className="inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add session
            </button>
            <span>
              Total: {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m across {sessions.length}{' '}
              session{sessions.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="mt-4 flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSplit}
              disabled={busy || invalidReason !== null}
              title={invalidReason ?? undefined}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Splitting…' : `Create ${sessions.length} subtask${sessions.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
