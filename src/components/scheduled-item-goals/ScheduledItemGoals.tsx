'use client';

import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { Clock, X, Plus } from 'lucide-react';
import { getTaskTypeColor, PRISM_COLORS } from '@/lib/prism-colors';
import { patchWorkBlock } from '@/lib/work-blocks-client';

export interface WorkBlockClearGoal {
  id: string;
  text: string;
  isComplete: boolean;
  sortOrder: number;
}

export interface ScheduledWorkBlock {
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  completionStatus?: string;
  task: {
    id: string;
    title: string;
    taskType: string;
    priority?: string;
    status?: string;
    dueDate?: string | null;
    estimatedMinutes?: number | null;
  };
  clearGoals: WorkBlockClearGoal[];
}

export interface ScheduledAimInstance {
  id: string;
  scheduledDate: string;
  timeBlockStart?: string | null;
  timeBlockEnd?: string | null;
  status: string;
  activityNote?: string | null;
  selectedActivity?: string | null;
  aimCategory: { id: string; name: string };
}

export interface ScheduledProcessExecution {
  id: string;
  processId: string;
  title: string;
  timeBlockStart?: string | null;
  timeBlockEnd?: string | null;
}

export interface ScheduledTaskOnly {
  id: string;
  title: string;
  taskType?: string;
  timeBlockStart?: string | null;
  timeBlockEnd?: string | null;
}

export type ScheduledItem =
  | { kind: 'workBlock'; block: ScheduledWorkBlock }
  | { kind: 'aimInstance'; aim: ScheduledAimInstance }
  | { kind: 'processExecution'; exec: ScheduledProcessExecution }
  | { kind: 'taskOnly'; task: ScheduledTaskOnly };

interface Props {
  item: ScheduledItem;
  mode?: 'inline' | 'popover';
  powerdownId?: string;
  onChange?: () => void;
}

export function ScheduledItemGoals({ item, mode = 'inline', powerdownId, onChange }: Props) {
  if (item.kind === 'workBlock') {
    return <WorkBlockEditor block={item.block} mode={mode} onChange={onChange} />;
  }
  if (item.kind === 'aimInstance') {
    return <AimInstanceEditor aim={item.aim} mode={mode} onChange={onChange} />;
  }
  if (item.kind === 'processExecution') {
    return <ProcessExecutionDisplay exec={item.exec} mode={mode} />;
  }
  return <TaskOnlyEditor task={item.task} mode={mode} powerdownId={powerdownId} onChange={onChange} />;
}

function formatTimeRange(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!endIso) return fmt(start);
  return `${fmt(start)} – ${fmt(new Date(endIso))}`;
}

function TimeRow({ start, end, label }: { start?: string | null; end?: string | null; label?: string }) {
  const range = formatTimeRange(start, end);
  if (!range && !label) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      {range && <Clock className="h-3 w-3" />}
      {range && <span>{range}</span>}
      {range && label && <span aria-hidden="true">·</span>}
      {label && <span>{label}</span>}
    </div>
  );
}

// ---------- WorkBlock ----------

function WorkBlockEditor({
  block,
  mode,
  onChange,
}: {
  block: ScheduledWorkBlock;
  mode: 'inline' | 'popover';
  onChange?: () => void;
}) {
  const [objective, setObjective] = useState(block.mainObjective);
  const [goals, setGoals] = useState<WorkBlockClearGoal[]>(block.clearGoals);
  const [newGoal, setNewGoal] = useState('');
  const [pending, setPending] = useState(false);
  const lastSavedObjective = useRef(block.mainObjective);

  // Re-sync local state when the prop changes (after parent revalidates)
  useEffect(() => {
    setObjective(block.mainObjective);
    lastSavedObjective.current = block.mainObjective;
    setGoals(block.clearGoals);
  }, [block.mainObjective, block.clearGoals]);

  const colorKey = (block.task.taskType ?? 'IMPROVE').toUpperCase();
  const color = getTaskTypeColor(colorKey);

  async function savePatch(body: Record<string, unknown>): Promise<boolean> {
    setPending(true);
    try {
      const res = await patchWorkBlock(block.id, body);
      if (res.ok) onChange?.();
      return res.ok;
    } finally {
      setPending(false);
    }
  }

  async function commitObjective() {
    const trimmed = objective.trim();
    if (!trimmed || trimmed === lastSavedObjective.current) return;
    const prev = lastSavedObjective.current;
    lastSavedObjective.current = trimmed;
    const ok = await savePatch({ mainObjective: trimmed });
    if (!ok) lastSavedObjective.current = prev;
  }

  async function addGoal() {
    const text = newGoal.trim();
    if (!text) return;
    const prev = goals;
    const next = [...goals, { id: `tmp-${Date.now()}`, text, isComplete: false, sortOrder: goals.length }];
    setGoals(next);
    setNewGoal('');
    const ok = await savePatch({ subGoals: next.map((g) => g.text) });
    if (!ok) setGoals(prev);
  }

  async function removeGoal(id: string) {
    const prev = goals;
    const next = goals.filter((g) => g.id !== id);
    setGoals(next);
    const ok = await savePatch({ subGoals: next.map((g) => g.text) });
    if (!ok) setGoals(prev);
  }

  const containerClass =
    mode === 'popover' ? 'space-y-2' : 'rounded-lg bg-[var(--surface-raised)]/50 p-3 space-y-2';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color.bgClass} ${color.textClass}`}
          title={color.label}
        >
          {color.emoji} {color.label}
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{block.task.title}</span>
        {pending && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" aria-label="Saving" />}
      </div>

      <TimeRow start={block.start} end={block.end} />

      <input
        type="text"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        onBlur={commitObjective}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="Main objective"
        placeholder="What's the focus for this session?"
        className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
      />

      {goals.length > 0 && (
        <ul className="space-y-1">
          {goals.map((goal, i) => (
            <li key={goal.id} className="group flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="text-indigo-400">{i + 1}.</span>
              <span className="flex-1">{goal.text}</span>
              <button
                type="button"
                aria-label="Remove sub-goal"
                onClick={() => removeGoal(goal.id)}
                className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        <input
          type="text"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addGoal();
            }
          }}
          placeholder="Add a clear goal..."
          aria-label="Add a clear goal"
          className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
        />
      </div>
    </div>
  );
}

// ---------- AIM ----------

function AimInstanceEditor({
  aim,
  mode,
  onChange,
}: {
  aim: ScheduledAimInstance;
  mode: 'inline' | 'popover';
  onChange?: () => void;
}) {
  const [note, setNote] = useState(aim.activityNote ?? '');
  const [pending, setPending] = useState(false);
  const lastSavedNote = useRef(aim.activityNote ?? '');

  useEffect(() => {
    setNote(aim.activityNote ?? '');
    lastSavedNote.current = aim.activityNote ?? '';
  }, [aim.activityNote]);

  const aimColor = PRISM_COLORS.AIM;

  async function commitNote() {
    if (note === lastSavedNote.current) return;
    lastSavedNote.current = note;
    setPending(true);
    try {
      const res = await fetch(`/api/aims/instances/${aim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityNote: note }),
      });
      if (res.ok) onChange?.();
    } finally {
      setPending(false);
    }
  }

  const containerClass =
    mode === 'popover' ? 'space-y-2' : 'rounded-lg bg-[var(--surface-raised)]/50 p-3 space-y-2';

  const headline = aim.selectedActivity
    ? `${aim.aimCategory.name}: ${aim.selectedActivity}`
    : aim.aimCategory.name;

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${aimColor.bgClass} ${aimColor.textClass}`}
        >
          {aimColor.emoji} {aimColor.label}
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{headline}</span>
        {pending && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" aria-label="Saving" />}
      </div>

      <TimeRow start={aim.timeBlockStart ?? null} end={aim.timeBlockEnd ?? null} />

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="Activity note"
        placeholder="Intent for this session..."
        className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
      />
    </div>
  );
}

// ---------- ProcessExecution (read-only) ----------

function ProcessExecutionDisplay({
  exec,
  mode,
}: {
  exec: ScheduledProcessExecution;
  mode: 'inline' | 'popover';
}) {
  const containerClass =
    mode === 'popover' ? 'space-y-1' : 'rounded-lg bg-[var(--surface-raised)]/50 p-3 space-y-1';
  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Recurring process
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{exec.title}</span>
      </div>
      <TimeRow start={exec.timeBlockStart ?? null} end={exec.timeBlockEnd ?? null} />
    </div>
  );
}

// ---------- Task without WorkBlock (fallback) ----------

interface TaskClearGoal {
  id: string;
  text: string;
  isComplete: boolean;
  sortOrder: number;
}

function TaskOnlyEditor({
  task,
  mode,
  powerdownId,
  onChange,
}: {
  task: ScheduledTaskOnly;
  mode: 'inline' | 'popover';
  powerdownId?: string;
  onChange?: () => void;
}) {
  const url = `/api/tasks/${task.id}/clear-goals`;
  const { data, mutate } = useSWR<TaskClearGoal[]>(url);
  const [newGoal, setNewGoal] = useState('');

  const goals = data ?? [];
  const colorKey = (task.taskType ?? 'IMPROVE').toUpperCase();
  const color = getTaskTypeColor(colorKey);

  async function addGoal() {
    const text = newGoal.trim();
    if (!text) return;
    setNewGoal('');
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(powerdownId ? { powerdownId } : {}) }),
    });
    mutate();
    onChange?.();
  }

  async function removeGoal(id: string) {
    await fetch(`${url}?goalId=${id}`, { method: 'DELETE' });
    mutate();
    onChange?.();
  }

  const containerClass =
    mode === 'popover' ? 'space-y-2' : 'rounded-lg bg-[var(--surface-raised)]/50 p-3 space-y-2';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color.bgClass} ${color.textClass}`}
        >
          {color.emoji} {color.label}
        </span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{task.title}</span>
      </div>

      <TimeRow start={task.timeBlockStart ?? null} end={task.timeBlockEnd ?? null} label="No work block yet" />

      {goals.length > 0 && (
        <ul className="space-y-1">
          {goals.map((goal, i) => (
            <li key={goal.id} className="group flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="text-indigo-400">{i + 1}.</span>
              <span className="flex-1">{goal.text}</span>
              <button
                type="button"
                aria-label="Remove sub-goal"
                onClick={() => removeGoal(goal.id)}
                className="rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        <input
          type="text"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addGoal();
            }
          }}
          placeholder="Add a clear goal..."
          aria-label="Add a clear goal"
          className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
        />
      </div>
    </div>
  );
}
