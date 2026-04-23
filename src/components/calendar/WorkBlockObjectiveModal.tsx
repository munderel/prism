'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Target } from 'lucide-react';

export interface TaskLevelClearGoal {
  id: string;
  text: string;
}

export interface WorkBlockObjectiveInput {
  taskId: string;
  taskTitle: string;
  start: Date;
  end: Date;
  /** Initial proposed duration in minutes (min(defaultWorkBlockMinutes, remaining)) */
  proposedMinutes: number;
  /** Prefill main objective (edit mode). If empty in create mode, defaults to "Work on {taskTitle}". */
  initialMainObjective?: string;
  /** Prefill sub-goals (edit mode) */
  initialSubGoals?: string[];
  /** Task-level clear goals the user can carry over as new workblock-scoped sub-goals */
  taskLevelClearGoals?: TaskLevelClearGoal[];
}

export interface WorkBlockObjectivePayload {
  start: string; // ISO
  end: string;   // ISO
  mainObjective: string;
  subGoals: string[];
}

/** Shape used when a caller opens the naming modal on drag-create. */
export interface WorkBlockNameRequest {
  taskId: string;
  taskTitle: string;
  start: Date;
  end: Date;
  proposedMinutes: number;
}

export interface WorkBlockNameResolved {
  start: Date;
  end: Date;
  mainObjective: string;
  subGoals: string[];
}

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 480;

function defaultMainObjective(taskTitle: string): string {
  return `Work on ${taskTitle}`;
}

function seedMainObjective(input: WorkBlockObjectiveInput, mode: 'create' | 'edit'): string {
  const trimmed = input.initialMainObjective?.trim();
  if (trimmed) return input.initialMainObjective ?? '';
  return mode === 'create' ? defaultMainObjective(input.taskTitle) : '';
}

interface SubGoalRow {
  key: string;
  text: string;
  /** Set when this row was added by checking a task-level clear goal checkbox. */
  originId?: string;
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

function combineDateTime(dateStr: string, timeStr: string): Date | null {
  // Return null rather than falling back to 1970-01-01 when the user has
  // cleared one of the inputs. Save is gated on this being non-null.
  const [y, m, day] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return new Date(y, m - 1, day, h, min, 0, 0);
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
  const [subGoals, setSubGoals] = useState<SubGoalRow[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(input?.proposedMinutes ?? 30);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed only when the modal opens OR the target task changes — not on every
  // parent re-render. Depending on the `input` object identity would wipe the
  // user's in-progress edits whenever the parent re-renders.
  useEffect(() => {
    if (open && input) {
      setMainObjective(seedMainObjective(input, mode));
      setSubGoals((input.initialSubGoals ?? []).map((text) => ({ key: crypto.randomUUID(), text })));
      setDurationMinutes(input.proposedMinutes);
      setStartDate(toDateInputValue(input.start));
      setStartTime(toTimeInputValue(input.start));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, input?.taskId]);

  if (!open || !input) return null;

  const isEditMode = mode === 'edit';

  const addSubGoal = () => setSubGoals((prev) => [...prev, { key: crypto.randomUUID(), text: '' }]);
  const updateSubGoal = (key: string, value: string) => {
    setSubGoals((prev) => prev.map((row) => (row.key === key ? { ...row, text: value } : row)));
  };
  const removeSubGoal = (key: string) => {
    setSubGoals((prev) => prev.filter((row) => row.key !== key));
  };
  const bumpMinutes = (delta: number) => {
    setDurationMinutes((prev) => Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, prev + delta)));
  };
  const toggleCarryOver = (goal: TaskLevelClearGoal) => {
    setSubGoals((prev) => {
      const existing = prev.findIndex((row) => row.originId === goal.id);
      if (existing >= 0) return prev.filter((_, i) => i !== existing);
      return [...prev, { key: crypto.randomUUID(), text: goal.text, originId: goal.id }];
    });
  };

  const combined = editableStart && startDate && startTime
    ? combineDateTime(startDate, startTime)
    : null;
  const resolvedStart = combined ?? input.start;
  const hasValidDateTime = !editableStart || combined !== null;

  const canSave = hasValidDateTime && mainObjective.trim().length > 0 && !saving;

  const save = async () => {
    const objective = mainObjective.trim();
    if (!objective) {
      setError('Main objective is required');
      return;
    }
    if (!hasValidDateTime) {
      setError('Enter a valid date and time');
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
        subGoals: subGoals.map((row) => row.text.trim()).filter((text) => text.length > 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
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

          {mode === 'create' && input.taskLevelClearGoals && input.taskLevelClearGoals.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
                Carry over task goals
              </label>
              <div className="space-y-1">
                {input.taskLevelClearGoals.map((goal) => {
                  const checked = subGoals.some((row) => row.originId === goal.id);
                  return (
                    <label
                      key={goal.id}
                      className="flex items-start gap-2 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCarryOver(goal)}
                        className="mt-0.5 h-4 w-4 accent-indigo-500"
                      />
                      <span className="leading-snug">{goal.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">
              Sub-goals (optional)
            </label>
            <div className="space-y-1.5">
              {subGoals.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.text}
                    onChange={(e) => updateSubGoal(row.key, e.target.value)}
                    placeholder="A concrete win for this block"
                    className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                  />
                  <button
                    onClick={() => removeSubGoal(row.key)}
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
                onChange={(e) =>
                  setDurationMinutes(
                    Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, Number(e.target.value) || 0)),
                  )
                }
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
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
            disabled={!canSave}
            title={!hasValidDateTime ? 'Enter a valid date and time' : undefined}
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
