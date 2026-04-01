'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { Plus, Pencil, Trash2, Save, X, Loader2 } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

const TASK_TYPES = ['IMPROVE', 'REACT', 'MAINTENANCE'] as const;
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

interface Task {
  id: string;
  title: string;
  taskType: string;
  priority: string;
  status: string;
  goalId?: string | null;
}

interface WeeklyGoal {
  id: string;
  title: string;
  status: string;
}

interface Stack {
  id: string;
  isCompany: boolean;
}

function getTaskTypeBadgeClass(taskType: string): string {
  switch (taskType) {
    case 'IMPROVE': return 'bg-blue-500/20 text-blue-400';
    case 'REACT': return 'bg-orange-500/20 text-orange-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'bg-red-500/20 text-red-400';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400';
    case 'MEDIUM': return 'bg-blue-500/20 text-blue-400';
    default: return 'bg-[var(--surface-raised)] text-[var(--text-muted)]';
  }
}

interface InlineTaskCreatorProps {
  isTeamReview?: boolean;
}

export function InlineTaskCreator({ isTeamReview }: InlineTaskCreatorProps) {
  const tasksUrl = isTeamReview
    ? '/api/tasks?includeUnscheduled=true&scope=company'
    : '/api/tasks?includeUnscheduled=true';
  const { data: tasks, mutate } = useSWR<Task[]>(tasksUrl, fetcher);

  const goalsUrl = isTeamReview
    ? '/api/goals?isCompany=true&level=WEEKLY&status=IN_PROGRESS'
    : null;
  const { data: stacks } = useSWR<Stack[]>(isTeamReview ? null : '/api/stacks', fetcher);
  const personalStackId = useMemo(() => {
    if (isTeamReview) return null;
    const arr = Array.isArray(stacks) ? stacks : [];
    return arr.find((s) => !s.isCompany)?.id ?? null;
  }, [stacks, isTeamReview]);
  const personalGoalsUrl = personalStackId ? `/api/goals?stackId=${personalStackId}` : null;
  const { data: goalsData } = useSWR(
    isTeamReview ? goalsUrl : personalGoalsUrl,
    fetcher
  );
  const weeklyGoals = useMemo(() => {
    const arr = Array.isArray(goalsData) ? goalsData : [];
    const now = new Date();
    const dow = now.getDay();
    const off = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + off);
    thisMonday.setHours(0, 0, 0, 0);
    const upcomingEnd = new Date(thisMonday);
    upcomingEnd.setDate(thisMonday.getDate() + 6);
    upcomingEnd.setHours(23, 59, 59, 999);

    return arr.filter((g: any) => {
      if (g.level !== 'WEEKLY') return false;
      if (!g.startDate || !g.endDate) return false;
      const gs = new Date(g.startDate);
      const ge = new Date(g.endDate);
      return gs <= upcomingEnd && ge >= thisMonday;
    }) as WeeklyGoal[];
  }, [goalsData]);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<string>('IMPROVE');
  const [newPriority, setNewPriority] = useState<string>('MEDIUM');
  const [newGoalId, setNewGoalId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          taskType: newTaskType,
          priority: newPriority,
          ...(newGoalId ? { goalId: newGoalId } : {}),
        }),
      });
      setNewTitle('');
      setNewGoalId('');
      setShowAddForm(false);
      mutate();
    } catch (err) {
      console.error('Failed during inline task operation:', err);
    }
    setSaving(false);
  }, [newTitle, newTaskType, newPriority, newGoalId, mutate]);

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditTaskType(task.taskType);
    setEditPriority(task.priority);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await fetch(`/api/tasks/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          taskType: editTaskType,
          priority: editPriority,
        }),
      });
      setEditingId(null);
      mutate();
    } catch (err) {
      console.error('Failed during inline task operation:', err);
    }
    setEditSaving(false);
  }, [editingId, editTitle, editTaskType, editPriority, mutate]);

  const handleDelete = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      console.error('Failed during inline task operation:', err);
    }
  }, [mutate]);

  const activeTasks = (tasks ?? []).filter(
    (t) => t.status !== 'DONE' && t.status !== 'DROPPED'
  );

  // Group active tasks by goalId
  const { goalSections, unlinkedTasks } = useMemo(() => {
    const goals = weeklyGoals;
    const goalMap = new Map<string, { goal: WeeklyGoal; tasks: Task[] }>();
    for (const goal of goals) {
      goalMap.set(goal.id, { goal, tasks: [] });
    }

    const unlinked: Task[] = [];

    for (const task of activeTasks) {
      if (task.goalId && goalMap.has(task.goalId)) {
        goalMap.get(task.goalId)!.tasks.push(task);
      } else {
        unlinked.push(task);
      }
    }

    return {
      goalSections: Array.from(goalMap.values()),
      unlinkedTasks: unlinked,
    };
  }, [activeTasks, weeklyGoals]);

  const renderTaskRow = (task: Task) => {
    if (editingId === task.id) {
      return (
        /* Edit form inline */
        <div
          key={task.id}
          className="rounded-lg border border-indigo-500/50 bg-[var(--surface-raised)] p-3 space-y-2"
        >
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <div className="flex items-center gap-2">
            <select
              value={editTaskType}
              onChange={(e) => setEditTaskType(e.target.value)}
              className="rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>{tt}</option>
              ))}
            </select>
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value)}
              className="rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {editSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={cancelEditing}
              className="flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    return (
      /* Read-only row */
      <div
        key={task.id}
        className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-2.5"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] truncate">{task.title}</p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getTaskTypeBadgeClass(task.taskType)}`}>
          {task.taskType}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getPriorityBadgeClass(task.priority)}`}>
          {task.priority}
        </span>
        <button
          onClick={() => startEditing(task)}
          className="p-1 text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
          title="Edit task"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => handleDelete(task.id)}
          className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
          title="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  const hasGoals = goalSections.length > 0;

  return (
    <div className="space-y-4">
      {/* Tasks grouped by weekly goal */}
      {!tasks ? (
        <div className="text-[var(--text-muted)] text-sm py-4 text-center">Loading tasks...</div>
      ) : activeTasks.length === 0 && !hasGoals ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          No tasks yet. Add your first task below.
        </p>
      ) : (
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {/* Sections for each weekly goal */}
          {goalSections.map(({ goal, tasks: goalTasks }) => (
            <div key={goal.id} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {goal.title}
                </h4>
                <button
                  onClick={() => { setNewGoalId(goal.id); setShowAddForm(true); }}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add task
                </button>
              </div>
              {goalTasks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] px-1 italic">No tasks linked</p>
              ) : (
                <div className="space-y-2">
                  {goalTasks.map(renderTaskRow)}
                </div>
              )}
            </div>
          ))}

          {/* Unlinked tasks section */}
          {unlinkedTasks.length > 0 && (
            <div className="space-y-2">
              {hasGoals && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] px-1">
                  Unlinked Tasks
                </h4>
              )}
              <div className="space-y-2">
                {unlinkedTasks.map(renderTaskRow)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Task form */}
      {showAddForm ? (
        <div className="rounded-lg border border-indigo-500/50 bg-[var(--surface-raised)] p-4 space-y-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            autoFocus
            className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">Type</label>
              <select
                value={newTaskType}
                onChange={(e) => setNewTaskType(e.target.value)}
                className="block rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              >
                {TASK_TYPES.map((tt) => (
                  <option key={tt} value={tt}>{tt}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="block rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {weeklyGoals.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-muted)]">Weekly Goal</label>
                <select
                  value={newGoalId}
                  onChange={(e) => setNewGoalId(e.target.value)}
                  className="block rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="">None</option>
                  {weeklyGoals.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={handleAdd}
              disabled={saving || !newTitle.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewTitle(''); setNewGoalId(''); }}
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-muted)] hover:border-indigo-500/50 hover:text-indigo-400 transition-colors w-full justify-center"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      )}
    </div>
  );
}
