'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Check, Plus, Trash2, Pencil, X } from 'lucide-react';

interface ClearGoal {
  id: string;
  text: string;
  completed: boolean;
}

interface ClearGoalsDisplayProps {
  taskId: string;
  editable?: boolean;
  compact?: boolean;
}

export function ClearGoalsDisplay({
  taskId,
  editable = false,
  compact = false,
}: ClearGoalsDisplayProps) {
  const apiUrl = `/api/tasks/${taskId}/clear-goals`;
  const { data, error, isLoading } = useSWR<ClearGoal[]>(apiUrl);

  const [newGoalText, setNewGoalText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        <span className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>Loading...</span>
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
    return (
      <p className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>No clear goals set</p>
    );
  }

  const toggleGoal = async (goalId: string, completed: boolean) => {
    await fetch(`${apiUrl}/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !completed }),
    });
    mutate(apiUrl);
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
    mutate(apiUrl);
  };

  const saveEdit = async (goalId: string) => {
    const text = editText.trim();
    if (!text) return;
    await fetch(`${apiUrl}/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    setEditingId(null);
    setEditText('');
    mutate(apiUrl);
  };

  const deleteGoal = async (goalId: string) => {
    await fetch(`${apiUrl}/${goalId}`, { method: 'DELETE' });
    mutate(apiUrl);
  };

  const startEdit = (goal: ClearGoal) => {
    setEditingId(goal.id);
    setEditText(goal.text);
  };

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {goals.map((goal) => (
        <div key={goal.id} className="group flex items-start gap-2">
          {/* Checkbox */}
          <button
            onClick={() => (editable || compact) && toggleGoal(goal.id, goal.completed)}
            disabled={!editable && !compact}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              goal.completed
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-300 bg-white hover:border-gray-400'
            } ${!editable && !compact ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {goal.completed && <Check className="h-3 w-3" />}
          </button>

          {/* Text or inline edit */}
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
                className="flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => saveEdit(goal.id)}
                className="rounded p-1 text-green-600 hover:bg-green-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span
              className={`flex-1 ${compact ? 'text-xs' : 'text-sm'} ${
                goal.completed ? 'text-gray-400 line-through' : 'text-gray-700'
              }`}
            >
              {goal.text}
            </span>
          )}

          {/* Edit / Delete (editable mode only, non-compact) */}
          {editable && !compact && editingId !== goal.id && (
            <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => startEdit(goal)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => deleteGoal(goal.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add new goal (editable, non-compact only) */}
      {editable && !compact && (
        <div className="flex items-center gap-2 pt-1">
          <Plus className="h-4 w-4 shrink-0 text-gray-300" />
          <input
            type="text"
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addGoal();
            }}
            placeholder="Add a clear goal..."
            className="flex-1 rounded border border-dashed border-gray-300 px-2 py-1 text-sm placeholder-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Empty state for editable */}
      {goals.length === 0 && editable && (
        <p className="text-sm text-gray-400">No clear goals set. Add one above.</p>
      )}
    </div>
  );
}
