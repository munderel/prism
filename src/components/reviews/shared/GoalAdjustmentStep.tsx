'use client';

import { Plus } from 'lucide-react';
import type { Goal } from './review-types';
import { GOAL_STATUSES } from './review-types';

interface GoalAdjustmentStepProps {
  goals: Goal[];
  editingGoals: Record<string, { title: string; description: string; status: string }>;
  onEdit: (goalId: string, field: string, value: string) => void;
  onSave: (goalId: string) => void;
  newGoalTitle: string;
  onNewGoalTitleChange: (v: string) => void;
  onAddGoal: () => void;
  goalLevelLabel?: string;
}

export function GoalAdjustmentStep({
  goals,
  editingGoals,
  onEdit,
  onSave,
  newGoalTitle,
  onNewGoalTitleChange,
  onAddGoal,
  goalLevelLabel = 'goal',
}: GoalAdjustmentStepProps) {
  return (
    <div className="space-y-4">
      {goals.map((goal) => {
        const edit = editingGoals[goal.id];
        if (!edit) return null;
        return (
          <div key={goal.id} className="rounded-lg border border-[var(--border-color)] px-4 py-3 space-y-3">
            <input
              type="text"
              value={edit.title}
              onChange={(e) => onEdit(goal.id, 'title', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            />
            <textarea
              value={edit.description}
              onChange={(e) => onEdit(goal.id, 'description', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="Description (optional)"
            />
            <div className="flex items-center gap-3">
              <select
                value={edit.status}
                onChange={(e) => onEdit(goal.id, 'status', e.target.value)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              >
                {GOAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              <button
                onClick={() => onSave(goal.id)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        );
      })}

      <div className="border-t border-[var(--border-color)] pt-4">
        <p className="text-xs text-[var(--text-muted)] mb-2">Add a new {goalLevelLabel} goal</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newGoalTitle}
            onChange={(e) => onNewGoalTitleChange(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            placeholder={`New ${goalLevelLabel} goal title...`}
            onKeyDown={(e) => e.key === 'Enter' && onAddGoal()}
          />
          <button
            onClick={onAddGoal}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
