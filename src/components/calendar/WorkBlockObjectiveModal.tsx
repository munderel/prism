'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Target } from 'lucide-react';

export interface WorkBlockObjectiveInput {
  taskId: string;
  taskTitle: string;
  start: Date;
  end: Date;
  /** Initial proposed duration in minutes (min(defaultWorkBlockMinutes, remaining)) */
  proposedMinutes: number;
  /** Prefill main objective (edit mode) */
  initialMainObjective?: string;
  /** Prefill sub-goals (edit mode) */
  initialSubGoals?: string[];
}

export interface WorkBlockObjectivePayload {
  start: string; // ISO
  end: string;   // ISO
  mainObjective: string;
  subGoals: string[];
}

interface Props {
  open: boolean;
  input: WorkBlockObjectiveInput | null;
  /** 'create' for new blocks, 'edit' for updating an existing block */
  mode?: 'create' | 'edit';
  /** When true, render date + time-of-day pickers so the start can be changed */
  editableStart?: boolean;
  onCancel: () => void;
  onSave: (payload: WorkBlockObjectivePayload) => Promise<void> | void;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1, h ?? 0, min ?? 0, 0, 0);
}

export function WorkBlockObjectiveModal({
  open,
  input,
  mode = 'create',
  editableStart = false,
  onCancel,
  onSave,
}: Props) {
  const [mainObjective, setMainObjective] = useState('');
  const [subGoals, setSubGoals] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(input?.proposedMinutes ?? 30);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && input) {
      setMainObjective(input.initialMainObjective ?? '');
      setSubGoals(input.initialSubGoals ?? []);
      setDurationMinutes(input.proposedMinutes);
      setStartDate(toDateInputValue(input.start));
      setStartTime(toTimeInputValue(input.start));
      setError(null);
    }
  }, [open, input]);

  if (!open || !input) return null;

  const isEditMode = mode === 'edit';

  const addSubGoal = () => setSubGoals((prev) => [...prev, '']);
  const updateSubGoal = (idx: number, value: string) => {
    setSubGoals((prev) => prev.map((g, i) => (i === idx ? value : g)));
  };
  const removeSubGoal = (idx: number) => {
    setSubGoals((prev) => prev.filter((_, i) => i !== idx));
  };
  const bumpMinutes = (delta: number) => {
    setDurationMinutes((prev) => Math.max(15, Math.min(480, prev + delta)));
  };

  const resolvedStart = editableStart && startDate && startTime
    ? combineDateTime(startDate, startTime)
    : input.start;

  const save = async () => {
    const objective = mainObjective.trim();
    if (!objective) {
      setError('Main objective is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newEnd = addMinutes(resolvedStart, durationMinutes);
      await onSave({
        start: resolvedStart.toISOString(),
        end: newEnd.toISOString(),
        mainObjective: objective,
        subGoals: subGoals.map((g) => g.trim()).filter((g) => g.length > 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        className="glass-panel w-full max-w-lg rounded-xl border border-[var(--border-color)] shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {isEditMode ? 'Edit work block' : 'Define this work block'}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          <div className="text-xs text-[var(--text-muted)]">
            <span className="font-medium">Task:</span> {input.taskTitle}
          </div>

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
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
              Sub-goals (optional)
            </label>
            <div className="space-y-1.5">
              {subGoals.map((goal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => updateSubGoal(idx, e.target.value)}
                    placeholder="A concrete win for this block"
                    className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                  />
                  <button
                    onClick={() => removeSubGoal(idx)}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addSubGoal}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add sub-goal
              </button>
            </div>
          </div>

          {editableStart && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">Start time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
              Duration (minutes)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(15, Math.min(480, Number(e.target.value) || 0)))}
                min={15}
                max={480}
                step={5}
                className="w-28 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
              />
              <div className="flex gap-1">
                {[15, 30, 60].map((delta) => (
                  <button
                    key={delta}
                    onClick={() => bumpMinutes(delta)}
                    className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[var(--text-muted)] ml-1">
                Ends{' '}
                {addMinutes(resolvedStart, durationMinutes).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEditMode ? 'Update block' : 'Schedule block'}
          </button>
        </div>
      </div>
    </div>
  );
}
