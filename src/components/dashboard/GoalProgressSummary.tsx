'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import { ProgressRing } from '@/components/dopamine/ProgressRing';

const levelColors: Record<string, string> = {
  HIGH_HARD: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  STRATEGIC: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
};

const levelLabels: Record<string, string> = {
  HIGH_HARD: 'HHG',
  STRATEGIC: 'Strategic',
};

export function GoalProgressSummary() {
  const { data: stacksData } = useSWR('/api/stacks');
  const stacks = useMemo(() => (Array.isArray(stacksData) ? stacksData : []), [stacksData]);

  // Get the user's personal (non-company) stack
  const personalStack = stacks.find((s: any) => !s.isCompany);
  const stackId = personalStack?.id;

  const { data: goalsData } = useSWR(
    stackId ? `/api/goals?stackId=${stackId}` : null
  );
  const goals = useMemo(() => (Array.isArray(goalsData) ? goalsData : []), [goalsData]);

  // Filter to top-level goals (HHG and Strategic)
  const topGoals = useMemo(
    () => goals.filter((g: any) => g.level === 'HIGH_HARD' || g.level === 'STRATEGIC').slice(0, 5),
    [goals]
  );

  if (topGoals.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg font-semibold text-white mb-4">Goal Progress</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {topGoals.map((goal: any) => (
          <div
            key={goal.id}
            className="glass-panel flex items-center gap-4 px-4 py-3 min-w-[240px] shrink-0"
          >
            <ProgressRing progress={goal.progressPct ?? 0} size={48} strokeWidth={4} />
            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                  levelColors[goal.level] ?? ''
                }`}
              >
                {levelLabels[goal.level] ?? goal.level}
              </span>
              <p className="text-sm font-medium text-white truncate mt-1">{goal.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
