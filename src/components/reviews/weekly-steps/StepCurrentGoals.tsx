'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingUp, ChevronRight } from 'lucide-react';

interface GoalParent {
  id: string;
  title: string;
  level: string;
  parent?: GoalParent | null;
}

interface Goal {
  id: string;
  title: string;
  level: string;
  status: string;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  parent?: GoalParent | null;
}

interface HierarchyNode {
  hhgTitle: string;
  yearlyTitle: string;
  monthlyGoals: Goal[];
  weeklyGoals: Goal[];
}

interface StepCurrentGoalsProps {
  reviewId: string;
  isTeamReview?: boolean;
}

/**
 * Check if a date range overlaps with a reference range.
 */
function rangesOverlap(
  goalStart: string | null,
  goalEnd: string | null,
  refStart: Date,
  refEnd: Date
): boolean {
  if (!goalStart && !goalEnd) return true; // No dates = assume current
  const gs = goalStart ? new Date(goalStart) : new Date(0);
  const ge = goalEnd ? new Date(goalEnd) : new Date('2099-12-31');
  return gs <= refEnd && ge >= refStart;
}

/**
 * Walk up the parent chain to build the hierarchy path.
 */
function getHierarchyPath(goal: Goal): { hhg: string; yearly: string } {
  let current: GoalParent | null | undefined = goal.parent;
  let monthly = '';
  let yearly = '';
  let hhg = '';

  while (current) {
    switch (current.level) {
      case 'MONTHLY':
        monthly = current.title;
        break;
      case 'STRATEGIC':
        yearly = current.title;
        break;
      case 'HIGH_HARD':
        hhg = current.title;
        break;
    }
    current = current.parent;
  }

  return {
    hhg: hhg || 'Ungrouped',
    yearly: yearly || monthly || 'Goals',
  };
}

export function StepCurrentGoals({ reviewId: _reviewId, isTeamReview }: StepCurrentGoalsProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilteredGoals();
  }, []);

  const fetchFilteredGoals = async () => {
    try {
      // When isTeamReview, fetch company goals directly instead of iterating stacks
      if (isTeamReview) {
        const goalsRes = await fetch('/api/goals?isCompany=true');
        if (!goalsRes.ok) { setLoading(false); return; }
        const goalsRaw = await goalsRes.json();
        const goals: Goal[] = Array.isArray(goalsRaw) ? goalsRaw : [];

        const now = new Date();
        const weekStart = new Date(now);
        const dayOfWeek = weekStart.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        weekStart.setDate(weekStart.getDate() + mondayOffset);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

        const filteredWeekly: Goal[] = [];
        const filteredMonthly: Goal[] = [];

        for (const g of goals) {
          if (g.level === 'WEEKLY' && rangesOverlap(g.startDate, g.endDate, weekStart, weekEnd)) {
            const detailRes = await fetch(`/api/goals/${g.id}?includeParents=true`);
            if (detailRes.ok) {
              const detail = await detailRes.json();
              filteredWeekly.push({ ...g, parent: detail.parent ?? null });
            } else {
              filteredWeekly.push(g);
            }
          }
          if (g.level === 'MONTHLY') {
            const isCurrentMonth = rangesOverlap(g.startDate, g.endDate, currentMonthStart, currentMonthEnd);
            const isNextMonth = rangesOverlap(g.startDate, g.endDate, nextMonthStart, nextMonthEnd);
            if (isCurrentMonth || isNextMonth) {
              const detailRes = await fetch(`/api/goals/${g.id}?includeParents=true`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                filteredMonthly.push({ ...g, parent: detail.parent ?? null });
              } else {
                filteredMonthly.push(g);
              }
            }
          }
        }

        const hierarchyMap = new Map<string, HierarchyNode>();
        for (const goal of [...filteredMonthly, ...filteredWeekly]) {
          const path = getHierarchyPath(goal);
          const key = `${path.hhg}::${path.yearly}`;
          if (!hierarchyMap.has(key)) {
            hierarchyMap.set(key, { hhgTitle: path.hhg, yearlyTitle: path.yearly, monthlyGoals: [], weeklyGoals: [] });
          }
          const node = hierarchyMap.get(key)!;
          if (goal.level === 'MONTHLY' && !node.monthlyGoals.find((gg) => gg.id === goal.id)) node.monthlyGoals.push(goal);
          if (goal.level === 'WEEKLY' && !node.weeklyGoals.find((gg) => gg.id === goal.id)) node.weeklyGoals.push(goal);
        }
        setHierarchy(Array.from(hierarchyMap.values()));
        setLoading(false);
        return;
      }

      const stacksRes = await fetch('/api/stacks');
      if (!stacksRes.ok) {
        setLoading(false);
        return;
      }
      const stacks = await stacksRes.json();

      const now = new Date();

      // Current week boundaries (Mon-Sun)
      const weekStart = new Date(now);
      const dayOfWeek = weekStart.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Current month boundaries
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Next month boundaries
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

      const filteredWeekly: Goal[] = [];
      const filteredMonthly: Goal[] = [];

      for (const stack of stacks) {
        const res = await fetch(`/api/goals?stackId=${stack.id}`);
        if (!res.ok) continue;
        const goalsRaw = await res.json();
        const goals: Goal[] = Array.isArray(goalsRaw) ? goalsRaw : [];

        for (const g of goals) {
          if (g.level === 'WEEKLY') {
            // Only show weekly goals that overlap with the current week
            if (rangesOverlap(g.startDate, g.endDate, weekStart, weekEnd)) {
              // Fetch with full parent chain
              const detailRes = await fetch(`/api/goals/${g.id}?includeParents=true`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                filteredWeekly.push({ ...g, parent: detail.parent ?? null });
              } else {
                filteredWeekly.push(g);
              }
            }
          }
          if (g.level === 'MONTHLY') {
            // Only current month and next month
            const isCurrentMonth = rangesOverlap(g.startDate, g.endDate, currentMonthStart, currentMonthEnd);
            const isNextMonth = rangesOverlap(g.startDate, g.endDate, nextMonthStart, nextMonthEnd);
            if (isCurrentMonth || isNextMonth) {
              const detailRes = await fetch(`/api/goals/${g.id}?includeParents=true`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                filteredMonthly.push({ ...g, parent: detail.parent ?? null });
              } else {
                filteredMonthly.push(g);
              }
            }
          }
        }
      }

      // Build hierarchy: group by HHG > Yearly
      const hierarchyMap = new Map<string, HierarchyNode>();

      for (const goal of [...filteredMonthly, ...filteredWeekly]) {
        const path = getHierarchyPath(goal);
        const key = `${path.hhg}::${path.yearly}`;

        if (!hierarchyMap.has(key)) {
          hierarchyMap.set(key, {
            hhgTitle: path.hhg,
            yearlyTitle: path.yearly,
            monthlyGoals: [],
            weeklyGoals: [],
          });
        }

        const node = hierarchyMap.get(key)!;
        if (goal.level === 'MONTHLY' && !node.monthlyGoals.find((g) => g.id === goal.id)) {
          node.monthlyGoals.push(goal);
        }
        if (goal.level === 'WEEKLY' && !node.weeklyGoals.find((g) => g.id === goal.id)) {
          node.weeklyGoals.push(goal);
        }
      }

      setHierarchy(Array.from(hierarchyMap.values()));
    } catch (err) {
      console.error('Failed to fetch current goals:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading goals...</div>;
  }

  const renderGoalCard = (goal: Goal, indent: number) => (
    <div
      key={goal.id}
      className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3"
      style={{ marginLeft: `${indent * 16}px` }}
    >
      <Target className="h-5 w-5 text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{goal.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            goal.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
            goal.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
            goal.status === 'ABANDONED' ? 'bg-red-500/20 text-red-400' :
            'bg-[var(--surface-raised)] text-[var(--text-muted)]'
          }`}>
            {goal.status.replace('_', ' ')}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{goal.level}</span>
          {goal.level === 'MONTHLY' && goal.startDate && (() => {
            const d = new Date(goal.startDate + 'T00:00:00');
            return (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                {d.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
            );
          })()}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-20 h-2 bg-[var(--surface-raised)] rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, goal.progressPct)}%` }}
          />
        </div>
        <span className="text-xs text-[var(--text-muted)] w-8 text-right">
          {Math.round(goal.progressPct)}%
        </span>
      </div>
    </div>
  );

  const hasGoals = hierarchy.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <TrendingUp className="h-4 w-4" />
        <p className="text-sm">Here are your current goals. Review them before continuing.</p>
      </div>

      {!hasGoals && (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
          <Target className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No active goals found for the current period.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            You can set goals in the Goal Stack page.
          </p>
        </div>
      )}

      {hierarchy.map((node, idx) => (
        <div key={idx} className="space-y-3">
          {/* HHG Header */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/40 to-transparent" />
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap">
              {node.hhgTitle}
            </h3>
            <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/40 to-transparent" />
          </div>

          {/* Yearly Goal subheader */}
          <div className="flex items-center gap-1.5 ml-2">
            <ChevronRight className="h-3 w-3 text-violet-400" />
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">
              {node.yearlyTitle}
            </span>
          </div>

          {/* Monthly Goals */}
          {node.monthlyGoals.length > 0 && (
            <div className="space-y-2 ml-4">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
                Monthly Goals{node.monthlyGoals.length > 0 && node.monthlyGoals[0].startDate && (
                  <> — {new Date(node.monthlyGoals[0].startDate + 'T00:00:00').toLocaleString('default', { month: 'long', year: 'numeric' })}</>
                )}
              </span>
              {node.monthlyGoals.map((g) => renderGoalCard(g, 0))}
            </div>
          )}

          {/* Weekly Goals */}
          {node.weeklyGoals.length > 0 && (
            <div className="space-y-2 ml-6">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
                Weekly Goals
              </span>
              {node.weeklyGoals.map((g) => renderGoalCard(g, 0))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
