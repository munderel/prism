'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, Plus, Trash2, Pencil, X, ChevronDown, ChevronRight } from 'lucide-react';

interface ClearGoal {
  id: string;
  text: string;
  isComplete: boolean;
}

interface ClearGoalsDisplayProps {
  taskId: string;
  editable?: boolean;
  compact?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function ClearGoalsDisplay({
  taskId,
  editable = false,
  compact = false,
  collapsible = false,
  defaultExpanded = false,
}: ClearGoalsDisplayProps) {
  const apiUrl = `/api/tasks/${taskId}/clear-goals`;
  const { data, error, isLoading, mutate } = useSWR<ClearGoal[]>(apiUrl);

  const [newGoalText, setNewGoalText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [collapsed, setCollapsed] = useState(collapsible && !editable && !defaultExpanded);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-indigo-500" />
        <span className={`text-[var(--text-muted)] ${compact ? 'text-xs' : 'text-sm'}`}>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className={`text-red-500 ${compact ? 'text-xs' : 'text-sm'}`}>
        Failed to load clear goals.
      </p>
    );
  }

  const goals = data ?? [];

  if (goals.length === 0 && !editable) {
    return null;
  }

  const toggleGoal = (goalId: string, isComplete: boolean) => {
    const optimisticGoals = goals.map((g) =>
      g.id === goalId ? { ...g, isComplete: !isComplete } : g
    );
    mutate(
      async () => {
        await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goals: [{ id: goalId, isComplete: !isComplete }] }),
        });
        return optimisticGoals;
      },
      { optimisticData: optimisticGoals, rollbackOnError: true, revalidate: true }
    );
  };

  const addGoal = async () => {
    const text = newGoalText.trim();
    if (!text) return;
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    setNewGoalText('');
    mutate();
  };

  const saveEdit = async (goalId: string) => {
    const text = editText.trim();
    if (!text) return;
    await fetch(apiUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ id: goalId, text }] }),
    });
    setEditingId(null);
    setEditText('');
    mutate();
  };

  const deleteGoal = async (goalId: string) => {
    await fetch(`${apiUrl}?goalId=${goalId}`, { method: 'DELETE' });
    mutate();
  };

  const startEdit = (goal: ClearGoal) => {
    setEditingId(goal.id);
    setEditText(goal.text);
  };

  const completedCount = goals.filter((g) => g.isComplete).length;

  // Collapsible header for compact/list view
  if (collapsible && goals.length === 0 && !editable) {
    return null;
  }

  return (
    <div className={compact ? 'pt-2 pb-1 px-2' : 'space-y-2 pt-3 pb-2 px-3'}>
      {collapsible && goals.length > 0 && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded px-1.5 py-0.5 transition-colors mb-1"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span>
            {completedCount}/{goals.length} goal{goals.length !== 1 ? 's' : ''}
          </span>
        </button>
      )}

      {!collapsed && (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          {goals.map((goal) => (
            <div key={goal.id} className="group flex items-start gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable || compact) toggleGoal(goal.id, goal.isComplete);
                }}
                disabled={!editable && !compact}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
                  goal.isComplete
                    ? 'border-indigo-500 bg-indigo-500 text-white'
                    : 'border-[var(--glass-border)] bg-[var(--input-bg)] hover:border-indigo-400'
                } ${!editable && !compact ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {goal.isComplete && <Check className="h-3 w-3" />}
              </button>

              {editingId === goal.id && editable ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(goal.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-0.5 text-sm text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                  />
                  <button
                    onClick={() => saveEdit(goal.id)}
                    className="rounded p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  className={`flex-1 ${compact ? 'text-xs' : 'text-sm'} ${
                    goal.isComplete
                      ? 'text-[var(--text-muted)] line-through decoration-[var(--text-muted)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {goal.text}
                </span>
              )}

              {editable && !compact && editingId !== goal.id && (
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(goal)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {editable && !compact && (
            <div className="flex items-center gap-2 pt-1">
              <Plus className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input
                type="text"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addGoal();
                }}
                placeholder="Add a clear goal..."
                className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
              />
            </div>
          )}

          {goals.length === 0 && editable && (
            <p className="text-sm text-[var(--text-muted)]">No clear goals set. Add one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
