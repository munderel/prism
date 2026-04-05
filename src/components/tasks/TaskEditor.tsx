'use client';

import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { LEVEL_LABELS } from '@/lib/goal-constants';
import { getLocalDateString } from '@/lib/date-utils';

interface TaskEditorProps {
  task?: any; // If editing
  prefilledGoalId?: string; // Pre-select goal when creating from goal stack
  onSave: () => void;
  onClose: () => void;
}

export function TaskEditor({ task, prefilledGoalId, onSave, onClose }: TaskEditorProps) {
  const isEditing = !!task;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const [taskType, setTaskType] = useState(task?.taskType ?? (prefilledGoalId ? 'IMPROVE' : 'IMPROVE'));
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState(task?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? getLocalDateString(new Date(task.dueDate)) : ''
  );
  const [goalId, setGoalId] = useState(task?.goalId ?? prefilledGoalId ?? '');
  const [recurrenceFreq, setRecurrenceFreq] = useState('DAILY');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  // Time blocking is now managed via the calendar drag-to-schedule UI
  const [goals, setGoals] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(task?.estimatedMinutes ?? 60);
  const [preferredTimeStart, setPreferredTimeStart] = useState(task?.preferredTimeStart ?? '');
  const [preferredTimeEnd, setPreferredTimeEnd] = useState(task?.preferredTimeEnd ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (taskType === 'IMPROVE') {
      fetchGoals();
    }
  }, [taskType]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) { setError('Failed to load users'); return; }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
    } catch {
      setError('Failed to load users');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const body: any = { title, description, priority, deliverable, estimatedMinutes };
      if (dueDate) body.dueDate = dueDate;
      if (preferredTimeStart) body.preferredTimeStart = preferredTimeStart;
      if (preferredTimeEnd) body.preferredTimeEnd = preferredTimeEnd;
      if (assigneeId) body.assigneeId = assigneeId;


      if (isEditing) {
        body.status = status;
        const res = await fetch(`/api/tasks/${task.id}`, {
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
          <div className="flex items-center justify-between mb-4">
            <h2 id="task-editor-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {isEditing ? 'Edit Task' : 'New Task'}
            </h2>
            <button aria-label="Close" title="Close" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
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

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Expected Deliverable</label>
              <input
                type="text"
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="e.g., 'Final report PDF', 'Working prototype'"
              />
            </div>

            {/* Estimated Duration */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Estimated Duration <span className="text-red-400">*</span></label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setEstimatedMinutes(mins)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      estimatedMinutes === mins
                        ? 'bg-indigo-600 text-white border border-indigo-600'
                        : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                    }`}
                  >
                    {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="Custom minutes"
              />
            </div>

            {/* Preferred Time Window */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Preferred Time From</label>
                <input
                  type="time"
                  value={preferredTimeStart}
                  onChange={(e) => setPreferredTimeStart(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Preferred Time To</label>
                <input
                  type="time"
                  value={preferredTimeEnd}
                  onChange={(e) => setPreferredTimeEnd(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
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
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Assignee selector */}
            {users.length > 0 && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
