'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, CalendarClock, ListTodo, MessageSquare } from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string;
  taskType: string;
  goal?: { id: string; title: string } | null;
}

interface StepReviewTasksProps {
  reviewId: string;
}

export function StepReviewTasks({ reviewId: _reviewId }: StepReviewTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchLastWeekTasks();
  }, []);

  const fetchLastWeekTasks = async () => {
    try {
      const now = new Date();
      const endDate = new Date(now);
      // Set to start of today
      endDate.setHours(0, 0, 0, 0);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);

      const res = await fetch(
        `/api/tasks?startDate=${getLocalDateString(startDate)}&endDate=${getLocalDateString(endDate)}`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error('Failed during task review operation:', err);
    }
    setLoading(false);
  };

  const toggleTaskComplete = (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';

    // Optimistic update: show the checkmark immediately
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    // Fire PATCH in background — no await
    fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
    });
  };

  const handleReschedule = async (taskId: string) => {
    if (!rescheduleDate) return;
    setSaving(taskId);

    try {
      // Update due date
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: rescheduleDate }),
      });

      // Add reschedule reason as comment
      if (rescheduleReason.trim()) {
        await fetch(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `Rescheduled during weekly review: ${rescheduleReason}`,
          }),
        });
      }

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, dueDate: rescheduleDate } : t))
      );
      setRescheduleTaskId(null);
      setRescheduleDate('');
      setRescheduleReason('');
    } catch (err) {
      console.error('Failed during task review operation:', err);
    }
    setSaving(null);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading last week&apos;s tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <ListTodo className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No tasks found from last week.</p>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === 'DONE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Review your tasks from last week. Mark complete or reschedule.
        </p>
        <span className="text-xs text-[var(--text-muted)]">
          {completedCount}/{tasks.length} done
        </span>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="space-y-0">
            <div
              className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3"
            >
              <button
                onClick={() => toggleTaskComplete(task)}
                className="flex-shrink-0"
              >
                {task.status === 'DONE' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <Circle className="h-5 w-5 text-[var(--text-muted)] hover:text-green-400 transition-colors" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm ${
                  task.status === 'DONE'
                    ? 'text-[var(--text-muted)] line-through'
                    : 'text-[var(--text-primary)]'
                }`}>
                  {task.title}
                </p>
                {task.goal && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {task.goal.title}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  task.priority === 'URGENT' ? 'bg-red-500/20 text-red-400' :
                  task.priority === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                  task.priority === 'MEDIUM' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-[var(--surface-raised)] text-[var(--text-muted)]'
                }`}>
                  {task.priority}
                </span>

                {task.status !== 'DONE' && (
                  <button
                    onClick={() => setRescheduleTaskId(
                      rescheduleTaskId === task.id ? null : task.id
                    )}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-500/10"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Reschedule
                  </button>
                )}
              </div>
            </div>

            {/* Reschedule panel */}
            {rescheduleTaskId === task.id && (
              <div className="ml-8 mt-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-[var(--text-secondary)] flex-shrink-0">New date:</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">
                    <MessageSquare className="h-3 w-3 inline mr-1" />
                    Reason (optional):
                  </label>
                  <input
                    type="text"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Why is this being rescheduled?"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReschedule(task.id)}
                    disabled={!rescheduleDate || saving === task.id}
                    className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-500 transition-colors disabled:opacity-50"
                  >
                    {saving === task.id ? 'Saving...' : 'Reschedule'}
                  </button>
                  <button
                    onClick={() => {
                      setRescheduleTaskId(null);
                      setRescheduleDate('');
                      setRescheduleReason('');
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-2 py-1 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
