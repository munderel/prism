'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { Plus, Pencil, Trash2, Save, X, Loader2, BarChart3 } from 'lucide-react';
import { formatGoalDateRange } from '@/lib/goal-constants';

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
  startDate?: string | null;
  endDate?: string | null;
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
  const { data: tasks, mutate } = useSWR<Task[]>(tasksUrl);

  const goalsUrl = isTeamReview
    ? '/api/goals?isCompany=true&level=WEEKLY&status=IN_PROGRESS'
    : null;
  const { data: stacks } = useSWR<Stack[]>(isTeamReview ? null : '/api/stacks');
  const personalStackId = useMemo(() => {
    if (isTeamReview) return null;
    const arr = Array.isArray(stacks) ? stacks : [];
    return arr.find((s) => !s.isCompany)?.id ?? null;
  }, [stacks, isTeamReview]);
  const personalGoalsUrl = personalStackId ? `/api/goals?stackId=${personalStackId}` : null;
  const { data: goalsData } = useSWR(
    isTeamReview ? goalsUrl : personalGoalsUrl
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
  const [newEstimatedMinutes, setNewEstimatedMinutes] = useState(60);
  const [newDueDate, setNewDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Default to REACT when no weekly goals are available (IMPROVE requires a goalId)
  const hasGoalsForImprove = weeklyGoals.length > 0;
  useEffect(() => {
    if (!hasGoalsForImprove && newTaskType === 'IMPROVE' && !newGoalId) {
      setNewTaskType('REACT');
    }
  }, [hasGoalsForImprove]); // eslint-disable-line react-hooks/exhaustive-deps

  // KPI state
  const [kpiExpandedGoal, setKpiExpandedGoal] = useState<string | null>(null);
  const [goalKpis, setGoalKpis] = useState<Record<string, any[]>>({});
  const [addingKpiForGoal, setAddingKpiForGoal] = useState<string | null>(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiType, setNewKpiType] = useState<'NUMERIC' | 'BINARY'>('NUMERIC');
  const [newKpiTarget, setNewKpiTarget] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');
  const [kpiSaving, setKpiSaving] = useState(false);

  const toggleKpiSection = async (goalId: string) => {
    if (kpiExpandedGoal === goalId) {
      setKpiExpandedGoal(null);
      return;
    }
    setKpiExpandedGoal(goalId);
    if (!goalKpis[goalId]) {
      try {
        const res = await fetch(`/api/goals/${goalId}/kpis`);
        if (res.ok) {
          const data = await res.json();
          setGoalKpis((prev) => ({ ...prev, [goalId]: data.kpis ?? data }));
        }
      } catch { /* ignore */ }
    }
  };

  const addKpiToGoal = async (goalId: string) => {
    if (!newKpiName.trim()) return;
    setKpiSaving(true);
    try {
      const body: Record<string, any> = { name: newKpiName.trim(), type: newKpiType };
      if (newKpiType === 'NUMERIC') {
        body.targetValue = parseFloat(newKpiTarget) || null;
        body.unit = newKpiUnit.trim() || null;
      }
      const res = await fetch(`/api/goals/${goalId}/kpis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setGoalKpis((prev) => ({
          ...prev,
          [goalId]: [...(prev[goalId] ?? []), created],
        }));
        setAddingKpiForGoal(null);
        setNewKpiName('');
        setNewKpiTarget('');
        setNewKpiUnit('');
        setNewKpiType('NUMERIC');
      }
    } catch (err) {
      console.error('Failed to add KPI:', err);
    }
    setKpiSaving(false);
  };

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    if (newTaskType === 'IMPROVE' && !newGoalId) {
      setAddError('IMPROVE tasks require a linked goal.');
      return;
    }
    if (newEstimatedMinutes <= 0) {
      setAddError('Estimated duration is required.');
      return;
    }
    setAddError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          taskType: newTaskType,
          priority: newPriority,
          estimatedMinutes: newEstimatedMinutes,
          ...(newDueDate ? { dueDate: newDueDate } : {}),
          ...(newGoalId ? { goalId: newGoalId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || 'Failed to create task.');
        setSaving(false);
        return;
      }
      setNewTitle('');
      setNewGoalId('');
      setNewDueDate('');
      setNewEstimatedMinutes(60);
      setShowAddForm(false);
      setAddError(null);
      mutate();
    } catch (err) {
      console.error('Failed during inline task operation:', err);
      setAddError('Failed to create task. Please try again.');
    }
    setSaving(false);
  }, [newTitle, newTaskType, newPriority, newGoalId, newEstimatedMinutes, newDueDate, mutate]);

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
                  {goal.startDate && goal.endDate && (
                    <span className="ml-2 normal-case font-normal text-cyan-400">
                      {formatGoalDateRange('WEEKLY', goal.startDate, goal.endDate)}
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleKpiSection(goal.id)}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <BarChart3 className="h-3 w-3" /> KPIs
                  </button>
                  <button
                    onClick={() => { setNewGoalId(goal.id); setShowAddForm(true); }}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add task
                  </button>
                </div>
              </div>

              {/* KPI section */}
              {kpiExpandedGoal === goal.id && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 space-y-2">
                  {(goalKpis[goal.id] ?? []).length > 0 ? (
                    (goalKpis[goal.id] ?? []).map((kpi: any) => (
                      <div key={kpi.id} className="flex items-center gap-2 text-xs rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5">
                        <span className="text-[var(--text-primary)] flex-1">{kpi.name}</span>
                        <span className="text-[var(--text-muted)]">
                          {kpi.type === 'NUMERIC' ? `${kpi.actualValue ?? '—'} / ${kpi.targetValue ?? '?'}${kpi.unit ? ` ${kpi.unit}` : ''}` : (kpi.isComplete ? 'Complete' : 'Incomplete')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No KPIs yet.</p>
                  )}
                  {addingKpiForGoal === goal.id ? (
                    <div className="space-y-2">
                      <input type="text" value={newKpiName} onChange={(e) => setNewKpiName(e.target.value)} placeholder="KPI name"
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none" />
                      <div className="flex gap-2">
                        <select value={newKpiType} onChange={(e) => setNewKpiType(e.target.value as 'NUMERIC' | 'BINARY')}
                          className="rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]">
                          <option value="NUMERIC">Numeric</option>
                          <option value="BINARY">Yes/No</option>
                        </select>
                        {newKpiType === 'NUMERIC' && (
                          <>
                            <input type="number" value={newKpiTarget} onChange={(e) => setNewKpiTarget(e.target.value)} placeholder="Target"
                              className="w-20 rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                            <input type="text" value={newKpiUnit} onChange={(e) => setNewKpiUnit(e.target.value)} placeholder="Unit"
                              className="w-16 rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                          </>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => addKpiToGoal(goal.id)} disabled={!newKpiName.trim() || kpiSaving}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-500 disabled:opacity-50">
                          {kpiSaving ? 'Saving...' : 'Add KPI'}
                        </button>
                        <button onClick={() => { setAddingKpiForGoal(null); setNewKpiName(''); setNewKpiTarget(''); setNewKpiUnit(''); }}
                          className="text-xs text-[var(--text-muted)] px-2 py-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingKpiForGoal(goal.id)}
                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                      <Plus className="h-3 w-3" /> Add KPI
                    </button>
                  )}
                </div>
              )}

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
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-muted)]">Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">Type <span className="text-red-400">*</span></label>
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
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">Duration <span className="text-red-400">*</span></label>
              <select
                value={newEstimatedMinutes}
                onChange={(e) => setNewEstimatedMinutes(parseInt(e.target.value))}
                className="block rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              >
                {[15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                  <option key={mins} value={mins}>{mins < 60 ? `${mins}m` : `${mins / 60}h`}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">Due Date</label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="block rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              />
            </div>
            {weeklyGoals.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-muted)]">
                  Weekly Goal {newTaskType === 'IMPROVE' && <span className="text-red-400">*</span>}
                </label>
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
              disabled={saving || !newTitle.trim() || newEstimatedMinutes <= 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewTitle(''); setNewGoalId(''); setNewDueDate(''); setAddError(null); }}
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
            >
              Cancel
            </button>
          </div>
          {addError && (
            <p className="text-xs text-red-400">{addError}</p>
          )}
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
