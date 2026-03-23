'use client';

import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface TaskEditorProps {
  task?: any; // If editing
  onSave: () => void;
  onClose: () => void;
}

export function TaskEditor({ task, onSave, onClose }: TaskEditorProps) {
  const isEditing = !!task;

  const [taskType, setTaskType] = useState(task?.taskType ?? 'GOAL_STACK');
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState(task?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [goalId, setGoalId] = useState(task?.goalId ?? '');
  const [recurrenceFreq, setRecurrenceFreq] = useState('DAILY');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  // Time blocking is now managed via the calendar drag-to-schedule UI
  const [goals, setGoals] = useState<any[]>([]);
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (taskType === 'GOAL_STACK') {
      fetchGoals();
    }
  }, [taskType]);

  const fetchGoals = async () => {
    const stacksRes = await fetch('/api/stacks');
    if (!stacksRes.ok) return;
    const stacks = await stacksRes.json();

    const allGoals: any[] = [];
    for (const stack of stacks) {
      const goalsRes = await fetch(`/api/goals?stackId=${stack.id}`);
      if (goalsRes.ok) {
        const data = await goalsRes.json();
        allGoals.push(
          ...data.map((g: any) => ({
            ...g,
            stackName: stack.name,
          }))
        );
      }
    }
    setGoals(allGoals);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: any = { title, description, priority, deliverable };
      if (dueDate) body.dueDate = dueDate;


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
        if (taskType === 'GOAL_STACK' && goalId) body.goalId = goalId;
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
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Task' : 'New Task'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Type (create only) */}
            {!isEditing && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Task Type</label>
                <div className="flex gap-2">
                  {['GOAL_STACK', 'REACT', 'MAINTENANCE'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTaskType(t)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        taskType === t
                          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                          : 'text-gray-400 border border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      {t === 'GOAL_STACK' ? 'Goal Stack' : t === 'REACT' ? 'React' : 'Maintenance'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="What needs to be done?"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Optional details..."
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Expected Deliverable</label>
              <input
                type="text"
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="e.g., 'Final report PDF', 'Working prototype'"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Goal selector for GOAL_STACK */}
            {taskType === 'GOAL_STACK' && !isEditing && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Linked Goal</label>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select a goal...</option>
                  {goals.map((g) => {
                    const levelLabels: Record<string, string> = {
                      HIGH_HARD: 'HHG',
                      STRATEGIC: 'Yearly',
                      MONTHLY: 'Monthly',
                      WEEKLY: 'Weekly',
                      DAILY: 'Daily',
                    };
                    const levelPrefix = levelLabels[g.level] ?? g.level;
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
                  <label className="block text-sm text-gray-400 mb-1">Frequency</label>
                  <select
                    value={recurrenceFreq}
                    onChange={(e) => setRecurrenceFreq(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Interval</label>
                  <input
                    type="number"
                    min="1"
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Status (edit only) */}
            {isEditing && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
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
                className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !title}
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
