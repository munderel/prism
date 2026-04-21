'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingUp, ChevronRight, Building2, Lock } from 'lucide-react';
import { formatGoalDateRange } from '@/lib/goal-constants';
import { getStatusBadgeClass } from '../shared/review-types';

interface CompanyGoalItem {
  id: string;
  title: string;
  level: string;
  status: string;
  progressPct: number;
  isAssignedToMe: boolean;
}

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
 * Get Monday (start of week) for a given date.
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Fetch all goals from either company endpoint or personal stacks.
 * Returns null if the initial fetch fails.
 */
async function fetchAllGoals(isTeamReview?: boolean): Promise<Goal[] | null> {
  if (isTeamReview) {
    const res = await fetch('/api/goals?isCompany=true');
    if (!res.ok) return null;
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  }

  const stacksRes = await fetch('/api/stacks');
  if (!stacksRes.ok) return null;
  const stacks = await stacksRes.json();

  const allGoals: Goal[] = [];
  for (const stack of stacks) {
    const res = await fetch(`/api/goals?stackId=${stack.id}`);
    if (!res.ok) continue;
    const raw = await res.json();
    const goals: Goal[] = Array.isArray(raw) ? raw : [];
    allGoals.push(...goals);
  }
  return allGoals;
}

/**
 * Enrich a goal with its parent hierarchy from the API.
 */
async function fetchGoalWithParent(goal: Goal): Promise<Goal> {
  const detailRes = await fetch(`/api/goals/${goal.id}?includeParents=true`);
  if (detailRes.ok) {
    const detail = await detailRes.json();
    return { ...goal, parent: detail.parent ?? null };
  }
  return goal;
}

/**
 * Group goals into hierarchy nodes keyed by HHG > Yearly.
 */
function buildHierarchy(goals: Goal[]): HierarchyNode[] {
  const hierarchyMap = new Map<string, HierarchyNode>();

  for (const goal of goals) {
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

  return Array.from(hierarchyMap.values());
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
  const [companyGoals, setCompanyGoals] = useState<CompanyGoalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilteredGoals();
    // Pull company goals independently — they're read-only context for the user
    // and don't depend on the personal goal filtering logic above.
    void fetchCompanyGoals();
  }, []);

  const fetchCompanyGoals = async () => {
    try {
      const res = await fetch('/api/goals?isCompany=true&withAssignments=true');
      if (!res.ok) return;
      const raw = await res.json();
      if (!Array.isArray(raw)) return;
      setCompanyGoals(
        raw.map((g) => ({
          id: g.id,
          title: g.title,
          level: g.level,
          status: g.status,
          progressPct: g.progressPct ?? 0,
          isAssignedToMe: Boolean(g.isAssignedToMe),
        })),
      );
    } catch (err) {
      console.warn('[current goals] company goal fetch failed:', err);
    }
  };

  const fetchFilteredGoals = async () => {
    try {
      // Gather all goals from either company or personal stacks
      const allGoals = await fetchAllGoals(isTeamReview);
      if (!allGoals) { setLoading(false); return; }

      const now = new Date();
      const weekStart = getMonday(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Collect candidates first, then resolve their parent-chains in parallel.
      // The prior sequential `await fetchGoalWithParent` inside a for-loop made
      // the wizard N+1-slow for users with more than a handful of goals.
      const weeklyCandidates = allGoals.filter(
        (g) => g.level === 'WEEKLY' && rangesOverlap(g.startDate, g.endDate, weekStart, weekEnd),
      );
      const monthlyCandidates = allGoals.filter(
        (g) => g.level === 'MONTHLY' && rangesOverlap(g.startDate, g.endDate, currentMonthStart, currentMonthEnd),
      );

      const [filteredWeekly, filteredMonthly] = await Promise.all([
        Promise.all(weeklyCandidates.map(fetchGoalWithParent)),
        Promise.all(monthlyCandidates.map(fetchGoalWithParent)),
      ]);

      setHierarchy(buildHierarchy([...filteredMonthly, ...filteredWeekly]));
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
          <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusBadgeClass(goal.status)}`}>
            {goal.status.replace('_', ' ')}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{goal.level}</span>
          {goal.level === 'MONTHLY' && goal.startDate && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400">
              {new Date(goal.startDate).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          )}
          {goal.level === 'WEEKLY' && goal.startDate && goal.endDate && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400">
              {formatGoalDateRange('WEEKLY', goal.startDate, goal.endDate)}
            </span>
          )}
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

      {companyGoals.length > 0 && !isTeamReview && (
        <div className="space-y-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Company Goals
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Read-only context. Goals assigned to you are highlighted.
          </p>
          <div className="space-y-2">
            {companyGoals.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-2"
              >
                <Lock className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {g.title}
                    </p>
                    <span className="flex-none rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-400">
                      Company
                    </span>
                    {g.isAssignedToMe && (
                      <span className="flex-none rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                        Assigned to you
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.min(100, g.progressPct)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-[var(--text-muted)]">
                    {Math.round(g.progressPct)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <> — {new Date(node.monthlyGoals[0].startDate).toLocaleString('default', { month: 'long', year: 'numeric' })}</>
                )}
              </span>
              {node.monthlyGoals.map((g) => renderGoalCard(g, 0))}
            </div>
          )}

          {/* Weekly Goals */}
          {node.weeklyGoals.length > 0 && (
            <div className="space-y-2 ml-6">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
                Current Weekly Goals
              </span>
              {node.weeklyGoals.map((g) => renderGoalCard(g, 0))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
