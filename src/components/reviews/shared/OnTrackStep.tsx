'use client';

import type { Goal } from './review-types';
import { STATUS_OPTIONS } from './review-types';

interface OnTrackStepProps {
  goals: Goal[];
  assessments: Record<string, string>;
  onAssess: (goalId: string, value: string) => void;
  emptyMessage?: string;
}

export function OnTrackStep({
  goals,
  assessments,
  onAssess,
  emptyMessage = 'No goals to assess.',
}: OnTrackStepProps) {
  if (goals.length === 0) {
    return <p className="text-[var(--text-muted)] text-sm italic">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <div key={goal.id} className="rounded-lg border border-[var(--border-color)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">{goal.title}</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => onAssess(goal.id, opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  assessments[goal.id] === opt
                    ? opt === 'On Track' ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                    : opt === 'Behind' ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/50'
                    : opt === 'At Risk' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                    : 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                    : 'bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
