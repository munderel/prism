'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingUp, ChevronRight, Lock } from 'lucide-react';
import { formatGoalDateRange } from '@/lib/goal-constants';
import { getStatusBadgeClass } from '../shared/review-types';

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
  isCompany?: boolean;
  isAssignedToMe?: boolean;
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

type AccentColor = 'indigo' | 'emerald';

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
 * Fetch all personal goals across the user's owned + assigned stacks.
 */
async function fetchPersonalGoals(): Promise<Goal[] | null> {
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
 * Fetch all company goals (read-only context for the user).
 */
async function fetchCompanyGoals(): Promise<Goal[] | null> {
  const res = await fetch('/api/goals?isCompany=true');
  if (!res.ok) return null;
  const raw = await res.json();
  if (!Array.isArray(raw)) return null;
  return raw.map((g) => ({
    ...g,
    isCompany: true,
    isAssignedToMe: Boolean(g.isAssignedToMe),
  }));
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

/**
 * Filter goals to this week (WEEKLY) ∪ this month (MONTHLY), then enrich
 * each with its parent chain in parallel and bucket into hierarchy nodes.
 */
async function filterAndBuildHierarchy(
  goals: Goal[],
  weekStart: Date,
  weekEnd: Date,
  monthStart: Date,
  monthEnd: Date,
): Promise<HierarchyNode[]> {
  const weeklyCandidates = goals.filter(
    (g) => g.level === 'WEEKLY' && rangesOverlap(g.startDate, g.endDate, weekStart, weekEnd),
  );
  const monthlyCandidates = goals.filter(
    (g) => g.level === 'MONTHLY' && rangesOverlap(g.startDate, g.endDate, monthStart, monthEnd),
  );

  const [filteredWeekly, filteredMonthly] = await Promise.all([
    Promise.all(weeklyCandidates.map(fetchGoalWithParent)),
    Promise.all(monthlyCandidates.map(fetchGoalWithParent)),
  ]);

  return buildHierarchy([...filteredMonthly, ...filteredWeekly]);
}

export function StepCurrentGoals({ reviewId: _reviewId, isTeamReview }: StepCurrentGoalsProps) {
  const [personalHierarchy, setPersonalHierarchy] = useState<HierarchyNode[]>([]);
  const [companyHierarchy, setCompanyHierarchy] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const weekStart = getMonday(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const [personal, company] = await Promise.all([
          fetchPersonalGoals(),
          isTeamReview ? Promise.resolve(null) : fetchCompanyGoals(),
        ]);
        if (cancelled) return;

        if (personal) {
          setPersonalHierarchy(
            await filterAndBuildHierarchy(personal, weekStart, weekEnd, monthStart, monthEnd),
          );
        }
        if (company) {
          setCompanyHierarchy(
            await filterAndBuildHierarchy(company, weekStart, weekEnd, monthStart, monthEnd),
          );
        }
      } catch (err) {
        console.error('Failed to fetch current goals:', err);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isTeamReview]);

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading goals...</div>;
  }

  const hasAny = personalHierarchy.length > 0 || companyHierarchy.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <TrendingUp className="h-4 w-4" />
        <p className="text-sm">Here are your current goals. Review them before continuing.</p>
      </div>

      {!hasAny && (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
          <Target className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No active goals found for the current period.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            You can set goals in the Goal Stack page.
          </p>
        </div>
      )}

      {companyHierarchy.length > 0 && (
        <HierarchySection label="COMPANY" accent="indigo" hierarchy={companyHierarchy} />
      )}

      {personalHierarchy.length > 0 && (
        <HierarchySection label="PERSONAL" accent="emerald" hierarchy={personalHierarchy} />
      )}
    </div>
  );
}

interface HierarchySectionProps {
  label: 'COMPANY' | 'PERSONAL';
  accent: AccentColor;
  hierarchy: HierarchyNode[];
}

function HierarchySection({ label, accent, hierarchy }: HierarchySectionProps) {
  // Static class strings so Tailwind's JIT can detect them.
  const accentText = accent === 'indigo' ? 'text-indigo-400' : 'text-emerald-400';
  const gradientFrom =
    accent === 'indigo' ? 'from-indigo-500/40' : 'from-emerald-500/40';
  const gradientTo =
    accent === 'indigo' ? 'to-indigo-500/40' : 'to-emerald-500/40';

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className={`h-px flex-1 bg-gradient-to-r ${gradientFrom} to-transparent`} />
        <h2 className={`text-sm font-bold uppercase tracking-[0.2em] ${accentText} whitespace-nowrap`}>
          {label}
        </h2>
        <div className={`h-px flex-1 bg-gradient-to-l ${gradientTo} to-transparent`} />
      </div>

      {hierarchy.map((node, idx) => (
        <div key={`${label}-${idx}`} className="space-y-3">
          {/* HHG Header */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-[var(--border-color)] to-transparent" />
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap">
              {node.hhgTitle}
            </h3>
            <div className="h-px flex-1 bg-gradient-to-l from-[var(--border-color)] to-transparent" />
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
                Monthly Goals{node.monthlyGoals[0].startDate && (
                  <> — {new Date(node.monthlyGoals[0].startDate).toLocaleString('default', { month: 'long', year: 'numeric' })}</>
                )}
              </span>
              {node.monthlyGoals.map((g) => <GoalRow key={g.id} goal={g} />)}
            </div>
          )}

          {/* Weekly Goals */}
          {node.weeklyGoals.length > 0 && (
            <div className="space-y-2 ml-6">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
                Current Weekly Goals
              </span>
              {node.weeklyGoals.map((g) => <GoalRow key={g.id} goal={g} />)}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  const Icon = goal.isCompany ? Lock : Target;
  const iconClass = goal.isCompany
    ? 'h-4 w-4 flex-shrink-0 text-[var(--text-muted)]'
    : 'h-5 w-5 flex-shrink-0 text-blue-400';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3">
      <Icon className={`${iconClass} mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-2 break-words">
          {goal.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
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
          {goal.isCompany && goal.isAssignedToMe && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Assigned to you
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
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
}
