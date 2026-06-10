'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import { LEVEL_LABELS } from '@/lib/goal-constants';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useTaskHydration } from '@/hooks/useTaskHydration';
import { WorkBlocksSection } from './WorkBlocksSection';
import { parseDurationToMinutes, formatMinutesCompact, sumTaskWorkBlockMinutes } from '@/lib/task-utils';
import { Avatar } from '@/components/ui/Avatar';
import { mutate } from 'swr';
import { parseLocalDate, toTaskDueDateKey } from '@/lib/date-utils';

const DURATION_PRESET_GROUPS: Array<{ label: string; presets: Array<{ label: string; minutes: number }> }> = [
  {
    label: 'Minutes',
    presets: [
      { label: '15m', minutes: 15 },
      { label: '30m', minutes: 30 },
      { label: '45m', minutes: 45 },
    ],
  },
  {
    label: 'Hours',
    presets: [
      { label: '1h', minutes: 60 },
      { label: '2h', minutes: 120 },
      { label: '4h', minutes: 240 },
      { label: '8h', minutes: 480 },
    ],
  },
  {
    label: 'Days',
    presets: [
      { label: '1d', minutes: 480 },
      { label: '2d', minutes: 960 },
      { label: '3d', minutes: 1440 },
      { label: '5d', minutes: 2400 },
    ],
  },
  {
    label: 'Weeks',
    presets: [
      { label: '1w', minutes: 2400 },
      { label: '2w', minutes: 4800 },
    ],
  },
];

interface TaskEditorProps {
  task?: any; // If editing
  prefilledGoalId?: string; // Pre-select goal when creating from goal stack
  onSave: () => void;
  onClose: () => void;
  /** When true, renders inline (no fixed backdrop, no dialog role). For the /tasks/[id]/edit page. */
  fullPage?: boolean;
}

export function TaskEditor({ task, prefilledGoalId, onSave, onClose, fullPage = false }: TaskEditorProps) {
  const isEditing = !!task;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!fullPage) dialogRef.current?.focus(); }, [fullPage]);

  // Hydrate relation fields (workBlocks, deliverableItems, assignee, goal)
  // when a partial task is passed by list-row callers. See useTaskHydration.
  const { fetchedRelations, hydratedTask } = useTaskHydration(task);

  // Use task (the original prop) as the source of truth for form field init.
  // hydratedTask is used only for relation-heavy computed values (hours, deliverableItems).
  const effectiveTask = task;

  const [taskType, setTaskType] = useState(effectiveTask?.taskType ?? (prefilledGoalId ? 'IMPROVE' : 'IMPROVE'));
  const [title, setTitle] = useState(effectiveTask?.title ?? '');
  const [description, setDescription] = useState(effectiveTask?.description ?? '');
  const [priority, setPriority] = useState(effectiveTask?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState(effectiveTask?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(
    effectiveTask?.dueDate ? toTaskDueDateKey(effectiveTask.dueDate) : ''
  );
  // dueTime: 'HH:mm' string or empty. Initialized from existing dueDate when
  // the stored value has a non-UTC-midnight time.
  //
  // Convention: date-only dueDates are stored as UTC midnight
  // (parseDateOnly → new Date('YYYY-MM-DDT00:00:00.000Z')).  When the user
  // previously set a specific time, the ISO carries a non-zero UTC hours or
  // minutes. We check getUTCHours/getUTCMinutes to detect the timed case, then
  // display the corresponding LOCAL clock values (getHours/getMinutes) so the
  // user sees the time they originally picked.
  const [dueTime, setDueTime] = useState<string>(() => {
    if (!task?.dueDate) return '';
    const d = new Date(task.dueDate);
    if (isNaN(d.getTime())) return '';
    // UTC midnight → treat as date-only, no time shown
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return '';
    // Non-UTC-midnight → user previously set a time; display local clock values
    const h = d.getHours();
    const m = d.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [startTime, setStartTime] = useState(
    effectiveTask?.startTime ? effectiveTask.startTime.slice(0, 16) : ''
  );
  const [goalId, setGoalId] = useState(effectiveTask?.goalId ?? prefilledGoalId ?? '');
  const [recurrenceFreq, setRecurrenceFreq] = useState('DAILY');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  // Time blocking is now managed via the calendar drag-to-schedule UI
  const [goals, setGoals] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [assigneeId, setAssigneeId] = useState(effectiveTask?.assigneeId ?? '');
  const [deliverableItems, setDeliverableItems] = useState<Array<{ id: string; text: string; isDone: boolean; position: number }>>(
    effectiveTask?.deliverableItems ?? [],
  );
  const [addingItem, setAddingItem] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(effectiveTask?.estimatedMinutes ?? 60);
  // Ref to the duration <input> so handleSubmit can read the live value even
  // when the user clicks Save without first blurring the field (onBlur race).
  const durationInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { data: userSettingsData } = useUserSettings();
  const defaultBlockMinutes = typeof userSettingsData?.defaultWorkBlockMinutes === 'number'
    ? (userSettingsData.defaultWorkBlockMinutes as number)
    : 30;

  useEffect(() => {
    if (taskType === 'IMPROVE') {
      fetchGoals();
    }
  }, [taskType]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      if (!res.ok) { setError('Failed to load users'); return; }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
    } catch {
      setError('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchGoals = async () => {
    try {
      const stacksRes = await fetch('/api/stacks');
      if (!stacksRes.ok) { setError('Failed to load goal stacks'); return; }
      const stacks = await stacksRes.json();

      const results = await Promise.all(
        stacks.map(async (stack: any) => {
          const goalsRes = await fetch(`/api/goals?stackId=${stack.id}`);
          if (!goalsRes.ok) return [];
          const data = await goalsRes.json();
          return data.map((g: any) => ({ ...g, stackName: stack.name }));
        })
      );
      const allGoals = results.flat();
      setGoals(allGoals);
    } catch {
      setError('Failed to load goal stacks');
    }
  };

  const refreshTask = () => {
    if (hydratedTask?.id) {
      mutate(`/api/tasks/${hydratedTask.id}`);
      mutate('/api/tasks');
    }
  };

  // `draft:` prefix marks items buffered in create mode; they're flushed
  // inside the POST /api/tasks call in handleSubmit.
  const isDraftItem = (id: string) => id.startsWith('draft:');

  const handleAddItem = async () => {
    const text = newItemText.trim();
    if (!text) return;

    if (!hydratedTask?.id) {
      // Create mode: buffer locally
      const draft = {
        id: `draft:${crypto.randomUUID()}`,
        text,
        isDone: false,
        position: deliverableItems.length,
      };
      setDeliverableItems((prev) => [...prev, draft]);
      setNewItemText('');
      setAddingItem(false);
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${hydratedTask.id}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError('Failed to add deliverable item');
        return;
      }
      const item = await res.json();
      setDeliverableItems((prev) => [...prev, item]);
      setNewItemText('');
      setAddingItem(false);
      refreshTask();
    } catch {
      setError('Failed to add deliverable item');
    }
  };

  const handleToggleItem = async (itemId: string, current: boolean) => {
    if (isDraftItem(itemId)) {
      setDeliverableItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, isDone: !current } : it)),
      );
      return;
    }
    if (!hydratedTask?.id) return;
    try {
      const res = await fetch(`/api/deliverables/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDone: !current }),
      });
      if (!res.ok) {
        setError('Failed to update deliverable item');
        return;
      }
      const updated = await res.json();
      setDeliverableItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
      refreshTask();
    } catch {
      setError('Failed to update deliverable item');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (isDraftItem(itemId)) {
      setDeliverableItems((prev) => prev.filter((it) => it.id !== itemId));
      return;
    }
    if (!hydratedTask?.id) return;
    try {
      const res = await fetch(`/api/deliverables/${itemId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204 || res.status === 404) {
        setDeliverableItems((prev) => prev.filter((it) => it.id !== itemId));
        refreshTask();
        return;
      }
      setError('Failed to delete deliverable item');
    } catch {
      setError('Failed to delete deliverable item');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }

    // Read the duration input's live value directly. If the user typed a new
    // duration but clicked Save without blurring first, the onBlur parser has
    // not yet updated `estimatedMinutes` state — so the stale state would be
    // submitted. Re-parse here so what's in the box always wins.
    let effectiveMinutes = estimatedMinutes;
    const rawDurationInput = durationInputRef.current?.value;
    if (typeof rawDurationInput === 'string' && rawDurationInput.trim() !== '') {
      const parsed = parseDurationToMinutes(rawDurationInput);
      if (parsed !== null) {
        effectiveMinutes = parsed;
        if (parsed !== estimatedMinutes) setEstimatedMinutes(parsed);
      }
    }
    if (!Number.isInteger(effectiveMinutes) || effectiveMinutes <= 0) {
      setError('Estimated duration must be a positive number of minutes');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body: any = { title, description, priority, estimatedMinutes: effectiveMinutes };
      if (dueDate) {
        if (dueTime) {
          // Combine date + local time: parseLocalDate anchors to local midnight,
          // then setHours/setMinutes applies the chosen time in local TZ.
          // Calling toISOString() converts to UTC, which round-trips correctly:
          // reading the ISO back with new Date() and extracting local h/m gives the same values.
          const [hh, mm] = dueTime.split(':').map(Number);
          const d = parseLocalDate(dueDate);
          d.setHours(hh, mm, 0, 0);
          body.dueDate = d.toISOString();
        } else {
          // No time: send bare YYYY-MM-DD string; server applies parseLocalDate → local-midnight UTC
          body.dueDate = dueDate;
        }
      }
      if (startTime) body.startTime = new Date(startTime).toISOString();
      else if (isEditing) body.startTime = null;
      body.assigneeId = assigneeId || null;


      if (isEditing) {
        body.status = status;
        const res = await fetch(`/api/tasks/${hydratedTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update task');
        }
      } else {
        body.taskType = taskType;
        if (taskType === 'IMPROVE' && goalId) body.goalId = goalId;
        if (taskType === 'MAINTENANCE') {
          body.recurrenceRule = `FREQ=${recurrenceFreq};INTERVAL=${recurrenceInterval}`;
        }
        if (deliverableItems.length > 0) {
          body.deliverableItems = deliverableItems.map((it) => ({ text: it.text }));
        }
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create task');
        }
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // When fetched deliverableItems arrive, sync the local state list.
  useEffect(() => {
    if (fetchedRelations?.deliverableItems != null) {
      setDeliverableItems(fetchedRelations.deliverableItems);
    }
  }, [fetchedRelations?.deliverableItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hours-done summary from completed/partial work blocks (read-only)
  const doneMinutes = useMemo(
    () => sumTaskWorkBlockMinutes(hydratedTask?.workBlocks),
    [hydratedTask?.workBlocks],
  );

  const assigneeOptions = useMemo(() => {
    const seed = hydratedTask?.assignee;
    if (!seed) return users;
    return users.some((u: any) => u.id === seed.id) ? users : [seed, ...users];
  }, [users, hydratedTask?.assignee]);

  const selectedAssignee = assigneeId
    ? assigneeOptions.find((u: any) => u.id === assigneeId) ?? null
    : null;

  const formContent = (
    <>
          <div className="flex items-center justify-between mb-4">
            <h2 id="task-editor-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {isEditing ? 'Edit Task' : 'New Task'}
            </h2>
            <div className="flex items-center gap-2">
              {selectedAssignee && <Avatar user={selectedAssignee} size="sm" />}
              {!fullPage && (
                <button aria-label="Close" title="Close" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Type (create only) */}
            {!isEditing && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Task Type <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {['IMPROVE', 'REACT', 'MAINTENANCE'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTaskType(t)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        taskType === t
                          ? 'bg-indigo-600 text-white border border-indigo-600'
                          : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                      }`}
                    >
                      {t === 'IMPROVE' ? 'Improve' : t === 'REACT' ? 'React' : 'Maintenance'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Title <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="What needs to be done?"
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Optional details..."
              />
            </div>

            {/* Deliverable Items — available in both create and edit modes.
                In create mode, items are buffered locally (handlers detect
                `draft:`-prefixed ids) and flushed in the POST /api/tasks call. */}
            <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Deliverable Items</label>
                <div className="space-y-1.5">
                  {deliverableItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 group"
                    >
                      <button
                        type="button"
                        aria-label={item.isDone ? 'Mark incomplete' : 'Mark done'}
                        onClick={() => handleToggleItem(item.id, item.isDone)}
                        className={`flex-shrink-0 h-4 w-4 rounded border-2 transition-colors ${
                          item.isDone
                            ? 'bg-green-600 border-green-600'
                            : 'border-[var(--border-color)] hover:border-indigo-500'
                        }`}
                      >
                        {item.isDone && (
                          <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`flex-1 text-sm min-w-0 ${item.isDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                        {item.text}
                      </span>
                      <button
                        type="button"
                        aria-label="Delete item"
                        onClick={() => handleDeleteItem(item.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {addingItem ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); }
                        if (e.key === 'Escape') { setAddingItem(false); setNewItemText(''); }
                      }}
                      className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                      placeholder="Deliverable item text…"
                    />
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={!newItemText.trim()}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingItem(false); setNewItemText(''); }}
                      className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingItem(true)}
                    className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </button>
                )}
              </div>

            {/* Estimated Duration */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Estimated Duration <span className="text-red-400">*</span></label>
              <div className="space-y-1.5 mb-2">
                {DURATION_PRESET_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] w-12 flex-shrink-0">
                      {group.label}
                    </span>
                    {group.presets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setEstimatedMinutes(preset.minutes)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          estimatedMinutes === preset.minutes
                            ? 'bg-indigo-600 text-white border border-indigo-600'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <input
                ref={durationInputRef}
                type="text"
                defaultValue={estimatedMinutes > 0 ? formatMinutesCompact(estimatedMinutes) : ''}
                key={`est:${estimatedMinutes}`}
                onBlur={(e) => {
                  const parsed = parseDurationToMinutes(e.target.value);
                  if (parsed !== null) setEstimatedMinutes(parsed);
                  else if (!e.target.value.trim()) setEstimatedMinutes(0);
                }}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="90m, 1.5h, 2d, 1w"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Accepts minutes, hours, days, or weeks. Days = 8h, weeks = 5 × 8h.
                {estimatedMinutes > 0 && (
                  <> · Current: <span className="text-[var(--text-secondary)]">{estimatedMinutes} minutes ({formatMinutesCompact(estimatedMinutes)})</span></>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    // Clear time when date is cleared
                    if (!e.target.value) setDueTime('');
                  }}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Due time — only shown when a due date is set */}
            {dueDate && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Time (optional)</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  aria-label="Due time (optional)"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Leave empty for an all-day task. Set a time to display the task at a specific hour on the calendar.</p>
              </div>
            )}

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Start date</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Task is visible from this time through its due date. Leave empty to show only on the due date.</p>
            </div>

            {/* Assignee selector */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">
                  {usersLoading ? 'Loading users...' : users.length > 0 ? 'Unassigned' : 'No users found'}
                </option>
                {assigneeOptions.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Goal selector for IMPROVE */}
            {taskType === 'IMPROVE' && !isEditing && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Linked Goal</label>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select a goal...</option>
                  {goals.map((g) => {
                    const levelPrefix = LEVEL_LABELS[g.level] ?? g.level;
                    return (
                      <option key={g.id} value={g.id}>
                        [{levelPrefix}] {g.title} ({g.stackName})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Recurrence for MAINTENANCE */}
            {taskType === 'MAINTENANCE' && !isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Frequency</label>
                  <select
                    value={recurrenceFreq}
                    onChange={(e) => setRecurrenceFreq(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Interval</label>
                  <input
                    type="number"
                    min="1"
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Hours summary — edit mode only, when task has been saved */}
            {isEditing && hydratedTask?.id && (estimatedMinutes > 0 || doneMinutes > 0) && (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2">
                <p className="text-sm text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">Hours: </span>
                  <span>{(doneMinutes / 60).toFixed(1)} done</span>
                  {estimatedMinutes > 0 && (
                    <span className="text-[var(--text-muted)]"> / {(estimatedMinutes / 60).toFixed(1)} estimated</span>
                  )}
                </p>
              </div>
            )}

            {/* Work Blocks (edit only) */}
            {isEditing && hydratedTask?.id && (
              <WorkBlocksSection
                taskId={hydratedTask.id}
                taskTitle={title || hydratedTask.title}
                taskEstimatedMinutes={estimatedMinutes}
                defaultBlockMinutes={defaultBlockMinutes}
              />
            )}

            {/* Status (edit only) */}
            {isEditing && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DONE">Done</option>
                  <option value="DROPPED">Dropped</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !title || estimatedMinutes <= 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
    </>
  );

  if (fullPage) {
    return (
      <div className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6">
        {formContent}
      </div>
    );
  }

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
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-editor-title"
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg rounded-xl border border-[var(--border-color)] bg-background p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {formContent}
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
