'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, PartyPopper, Target, Plus, Star } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

import type { Goal, Kpi, ReviewAnswer, StepConfig, HhgGroup } from './shared/review-types';
import { DifficultiesStep } from './shared/DifficultiesStep';
import { KpiProgressStep } from './shared/KpiProgressStep';
import { OnTrackStep } from './shared/OnTrackStep';
import { GoalAdjustmentStep } from './shared/GoalAdjustmentStep';
import { NotesCompletionStep } from './shared/NotesCompletionStep';

/* ------------------------------------------------------------------ */
/*  Date helpers                                                        */
/* ------------------------------------------------------------------ */

function isCurrentMonth(g: Goal): boolean {
  if (!g.startDate || !g.endDate) return false;
  const now = new Date();
  const start = new Date(g.startDate);
  const end = new Date(g.endDate);
  return now >= start && now <= end;
}

function isNextMonth(g: Goal): boolean {
  if (!g.startDate) return false;
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start = new Date(g.startDate);
  return start.getMonth() === nextMonth.getMonth() && start.getFullYear() === nextMonth.getFullYear();
}

function isCurrentYear(g: Goal): boolean {
  if (!g.startDate) return false;
  return new Date(g.startDate).getFullYear() === new Date().getFullYear();
}

function isNextYear(g: Goal): boolean {
  if (!g.startDate) return false;
  return new Date(g.startDate).getFullYear() === new Date().getFullYear() + 1;
}

/** Filter primary goals by period relevance */
function filterByPeriod(goals: Goal[], goalLevel: string): Goal[] {
  if (goalLevel === 'MONTHLY') {
    return goals.filter((g) => isCurrentMonth(g) || isNextMonth(g));
  }
  if (goalLevel === 'STRATEGIC') {
    return goals.filter((g) => isCurrentYear(g) || isNextYear(g));
  }
  return goals;
}

/* ------------------------------------------------------------------ */
/*  Hierarchy builder                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build an HHG-grouped hierarchy from the flat allGoals array.
 * Returns groups keyed by HHG, each containing yearly goals, each containing monthly goals.
 */
function buildHierarchy(allGoals: Goal[], relevantGoals: Goal[], goalLevel: string): HhgGroup[] {
  const goalMap = new Map<string, Goal>(allGoals.map((g) => [g.id, g]));
  const _relevantIds = new Set(relevantGoals.map((g) => g.id));

  // Walk each relevant goal up to its HHG ancestor
  const hhgMap = new Map<string, HhgGroup>();

  for (const goal of relevantGoals) {
    // Walk up: goal -> parent (STRATEGIC) -> grandparent (HIGH_HARD)
    let yearly: Goal | null = null;
    let hhg: Goal | null = null;

    if (goalLevel === 'MONTHLY') {
      // parent is STRATEGIC, grandparent is HIGH_HARD
      if (goal.parentId) {
        yearly = goalMap.get(goal.parentId) ?? null;
        if (yearly?.parentId) {
          hhg = goalMap.get(yearly.parentId) ?? null;
        }
      }
    } else if (goalLevel === 'STRATEGIC') {
      // goal IS the yearly; parent is HIGH_HARD
      yearly = goal;
      if (goal.parentId) {
        hhg = goalMap.get(goal.parentId) ?? null;
      }
    }

    if (!hhg) {
      // Create a synthetic "ungrouped" HHG
      hhg = {
        id: '__ungrouped__',
        title: 'Ungrouped Goals',
        description: null,
        level: 'HIGH_HARD',
        status: 'IN_PROGRESS',
        progressPct: 0,
        parentId: null,
        dueDate: null,
        startDate: null,
        endDate: null,
        stackId: '',
      };
    }

    if (!hhgMap.has(hhg.id)) {
      hhgMap.set(hhg.id, { hhg, yearlyGoals: [] });
    }
    const group = hhgMap.get(hhg.id)!;

    if (goalLevel === 'MONTHLY' && yearly) {
      let yearlyGroup = group.yearlyGoals.find((yg) => yg.yearly.id === yearly!.id);
      if (!yearlyGroup) {
        yearlyGroup = { yearly, monthlyGoals: [] };
        group.yearlyGoals.push(yearlyGroup);
      }
      yearlyGroup.monthlyGoals.push(goal);
    } else if (goalLevel === 'STRATEGIC' && yearly) {
      // For strategic (yearly) goals, monthly children are listed under the yearly
      let yearlyGroup = group.yearlyGoals.find((yg) => yg.yearly.id === yearly!.id);
      if (!yearlyGroup) {
        const monthlyChildren = allGoals.filter(
          (g) => g.level === 'MONTHLY' && g.parentId === yearly!.id
        );
        yearlyGroup = { yearly, monthlyGoals: monthlyChildren };
        group.yearlyGoals.push(yearlyGroup);
      }
    }
  }

  return Array.from(hhgMap.values());
}

/* ------------------------------------------------------------------ */
/*  Hierarchy display component                                         */
/* ------------------------------------------------------------------ */

function GoalHierarchyDisplay({
  groups,
  goalLevel,
  renderGoal,
}: {
  groups: HhgGroup[];
  goalLevel: string;
  renderGoal?: (goal: Goal) => ReactNode;
}) {
  if (groups.length === 0) {
    return <p className="text-[var(--text-muted)] text-sm italic">No goals found.</p>;
  }

  const defaultRenderGoal = (goal: Goal) => (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] px-4 py-3">
      <Target className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{goal.title}</p>
        {goal.description && (
          <p className="text-xs text-[var(--text-muted)] mt-1">{goal.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            goal.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
            goal.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
            goal.status === 'ABANDONED' ? 'bg-red-500/20 text-red-400' :
            'bg-[var(--surface-raised)] text-[var(--text-muted)]'
          }`}>
            {goal.status.replace('_', ' ')}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${goal.progressPct}%` }}
            />
          </div>
          <span className="text-xs text-[var(--text-muted)]">{Math.round(goal.progressPct)}%</span>
        </div>
      </div>
    </div>
  );

  const render = renderGoal ?? defaultRenderGoal;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.hhg.id} className="space-y-4">
          {/* HHG header */}
          {group.hhg.id !== '__ungrouped__' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">HHG</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{group.hhg.title}</p>
                  {group.hhg.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{group.hhg.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Yearly groups */}
          {group.yearlyGoals.map((yearlyGroup) => (
            <div key={yearlyGroup.yearly.id} className="ml-4 space-y-3">
              {/* Yearly subheader */}
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2">
                <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium mb-0.5">
                  {goalLevel === 'STRATEGIC' ? 'Yearly Goal' : 'Yearly Goal'}
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{yearlyGroup.yearly.title}</p>
                {yearlyGroup.yearly.startDate && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {new Date(yearlyGroup.yearly.startDate).getFullYear()}
                  </p>
                )}
              </div>

              {/* Goals under this yearly */}
              {goalLevel === 'MONTHLY' && (
                <div className="ml-4 space-y-2">
                  {yearlyGroup.monthlyGoals.map((goal) => (
                    <div key={goal.id}>{render(goal)}</div>
                  ))}
                </div>
              )}
              {goalLevel === 'STRATEGIC' && (
                <div className="ml-4">
                  {render(yearlyGroup.yearly)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

export interface PeriodReviewConfig {
  reviewId: string;
  isTeamReview?: boolean;
  /** Goal level this review operates on (MONTHLY, STRATEGIC, HIGH_HARD) */
  goalLevel: string;
  /** Parent level above goalLevel (STRATEGIC, HIGH_HARD, null) */
  parentGoalLevel: string | null;
  /** Child level for "plan next period" step (WEEKLY, MONTHLY, MONTHLY) */
  childGoalLevel: string;
  /** Human-readable period label ("month", "quarter", "year") */
  periodLabel: string;
  /** Steps that define the wizard flow */
  steps: StepConfig[];
  /** Step descriptions keyed by step key */
  stepDescriptions: Record<string, string>;
  /** Completion message */
  completionTitle: string;
  completionMessage: string;
  /** Labels for goal-level wording */
  goalLevelLabel: string;
  childGoalLabel: string;
  /** Placeholders */
  difficultiesPlaceholder: string;
  notesPlaceholder: string;
  difficultiesRows?: number;
  notesRows?: number;
  /** Optional: custom KPI empty message */
  kpiEmptyMessage?: string;
  /** Optional: custom on-track empty message */
  onTrackEmptyMessage?: string;
  /** Optional: label for the parent goal highlight (e.g. "Connected Yearly Goal") */
  parentGoalBannerLabel?: string;
  /** Optional: color scheme for parent goal banner: 'indigo' | 'amber' */
  parentGoalBannerColor?: 'indigo' | 'amber';
  /** Optional: label when no goals found */
  emptyGoalsMessage?: string;
  /** Optional: custom "plan next period" description text */
  planNextPeriodDescription?: string;
  /** Optional: custom "plan next period" new-goal placeholder */
  planNextPeriodPlaceholder?: string;
  /**
   * Optional: custom CurrentGoalsStep renderer.
   * If not provided, the hierarchy display is used.
   */
  renderCurrentGoals?: (goals: Goal[], parentGoal: Goal | null, hierarchy: HhgGroup[]) => ReactNode;
  /**
   * Optional: for yearly wizard, which fetches KPIs for a broader set of goals.
   * Returns the goals to fetch KPIs for, given (primaryGoals, allGoals).
   */
  getKpiGoals?: (primaryGoals: Goal[], allGoals: Goal[]) => Goal[];
  /**
   * Optional: custom logic for finding the "next period parent" goal.
   * Default picks a goal from primaryGoals by date heuristic.
   */
  findNextPeriodParent?: (primaryGoals: Goal[], allGoals: Goal[]) => string | null;
}

/* ------------------------------------------------------------------ */
/*  Default CurrentGoalsStep                                            */
/* ------------------------------------------------------------------ */

function DefaultCurrentGoalsStep({
  goals,
  hierarchy,
  goalLevel,
  emptyMessage,
}: {
  goals: Goal[];
  hierarchy: HhgGroup[];
  goalLevel: string;
  emptyMessage: string;
}) {
  if (hierarchy.length > 0) {
    return <GoalHierarchyDisplay groups={hierarchy} goalLevel={goalLevel} />;
  }

  if (goals.length === 0) {
    return <p className="text-[var(--text-muted)] text-sm italic">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <div key={goal.id} className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] px-4 py-3">
          <Target className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">{goal.title}</p>
            {goal.description && (
              <p className="text-xs text-[var(--text-muted)] mt-1">{goal.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                goal.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                goal.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                goal.status === 'ABANDONED' ? 'bg-red-500/20 text-red-400' :
                'bg-[var(--surface-raised)] text-[var(--text-muted)]'
              }`}>
                {goal.status.replace('_', ' ')}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${goal.progressPct}%` }}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)]">{Math.round(goal.progressPct)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan-next-period sub-component (with parent hierarchy)              */
/* ------------------------------------------------------------------ */

function PlanNextPeriodStep({
  childGoals,
  parentGoals,
  newTitle,
  onNewTitleChange,
  onAddGoal,
  onUpdateGoal,
  description,
  placeholder,
  goalLevel,
}: {
  childGoals: Goal[];
  parentGoals: Goal[];
  newTitle: string;
  onNewTitleChange: (v: string) => void;
  onAddGoal: () => void;
  onUpdateGoal: (id: string, title: string) => void;
  description: string;
  placeholder: string;
  goalLevel: string;
}) {
  // Group child goals under their parent (monthly) goal
  const grouped = useMemo(() => {
    if (goalLevel !== 'MONTHLY' || parentGoals.length === 0) return null;

    const groups: { parent: Goal; children: Goal[] }[] = [];
    const parentIds = new Set(parentGoals.map((p) => p.id));

    for (const parent of parentGoals) {
      const children = childGoals.filter((c) => c.parentId === parent.id);
      groups.push({ parent, children });
    }

    // Also gather orphaned children (parentId not in our set)
    const orphans = childGoals.filter((c) => !c.parentId || !parentIds.has(c.parentId));
    if (orphans.length > 0) {
      groups.push({
        parent: {
          id: '__orphan__',
          title: 'Other Goals',
          description: null,
          level: 'MONTHLY',
          status: 'IN_PROGRESS',
          progressPct: 0,
          parentId: null,
          dueDate: null,
          startDate: null,
          endDate: null,
          stackId: '',
        },
        children: orphans,
      });
    }

    return groups;
  }, [childGoals, parentGoals, goalLevel]);

  const renderChildGoal = (goal: Goal) => (
    <div key={goal.id} className="rounded-lg border border-[var(--border-color)] px-4 py-3">
      <input
        type="text"
        value={goal.title}
        onChange={(e) => onUpdateGoal(goal.id, e.target.value)}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          goal.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
          goal.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
          'bg-[var(--surface-raised)] text-[var(--text-muted)]'
        }`}>
          {goal.status.replace('_', ' ')}
        </span>
        {goal.startDate && (
          <span className="text-xs text-[var(--text-muted)]">
            {new Date(goal.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">{description}</p>

      {grouped ? (
        /* Monthly review: show weekly goals grouped under their parent monthly goal */
        <div className="space-y-6">
          {grouped.map(({ parent, children }) => (
            <div key={parent.id} className="space-y-3">
              {/* Monthly goal header card */}
              {parent.id !== '__orphan__' ? (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Target className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium mb-0.5">Monthly Goal</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{parent.title}</p>
                      {parent.startDate && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {new Date(parent.startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${parent.progressPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">{Math.round(parent.progressPct)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">{parent.title}</p>
              )}

              {/* Indented weekly goals */}
              <div className="ml-4 space-y-2">
                {children.map(renderChildGoal)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat list (yearly review or no parent goals) */
        childGoals.map(renderChildGoal)
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => onNewTitleChange(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
          placeholder={placeholder}
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
  );
}

/* ------------------------------------------------------------------ */
/*  Main shell                                                          */
/* ------------------------------------------------------------------ */

export function PeriodReviewWizard(config: PeriodReviewConfig) {
  const {
    reviewId,
    goalLevel,
    parentGoalLevel,
    childGoalLevel,
    steps,
    stepDescriptions,
    completionTitle,
    completionMessage,
    goalLevelLabel,
    childGoalLabel,
    difficultiesPlaceholder,
    notesPlaceholder,
    difficultiesRows,
    notesRows,
    kpiEmptyMessage,
    onTrackEmptyMessage,
    parentGoalBannerLabel: _parentGoalBannerLabel = 'Connected Parent Goal',
    parentGoalBannerColor: _parentGoalBannerColor = 'indigo',
    emptyGoalsMessage = 'No goals found.',
    planNextPeriodDescription = `Refine ${childGoalLabel} goals for the upcoming ${config.periodLabel}.`,
    planNextPeriodPlaceholder = `New ${childGoalLabel} goal...`,
    renderCurrentGoals,
    getKpiGoals,
    findNextPeriodParent,
    isTeamReview,
  } = config;

  const router = useRouter();
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [review, setReview] = useState<any>(null);

  // All goals (unfiltered) for hierarchy lookups
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  // Primary goals at the goalLevel (filtered to current + next period)
  const [primaryGoals, setPrimaryGoals] = useState<Goal[]>([]);
  const [parentGoal, setParentGoal] = useState<Goal | null>(null);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [difficulties, setDifficulties] = useState('');
  const [assessments, setAssessments] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  // Goal editing (goal-adjustment step)
  const [editingGoals, setEditingGoals] = useState<Record<string, { title: string; description: string; status: string }>>({});
  const [newGoalTitle, setNewGoalTitle] = useState('');

  // Plan next period (child goals)
  const [childGoals, setChildGoals] = useState<Goal[]>([]);
  const [newChildTitle, setNewChildTitle] = useState('');

  const [stackId, setStackId] = useState<string | null>(null);
  const [nextPeriodParentId, setNextPeriodParentId] = useState<string | null>(null);

  /* ---- Build hierarchy from allGoals + primaryGoals ---- */
  const hierarchy = useMemo(
    () => (allGoals.length > 0 ? buildHierarchy(allGoals, primaryGoals, goalLevel) : []),
    [allGoals, primaryGoals, goalLevel]
  );

  /* ---- Fetch initial data ---- */
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  const loadData = async () => {
    try {
      // Fetch review
      const reviewRes = await fetch(`/api/reviews/${reviewId}`);
      if (!reviewRes.ok) return;
      const reviewData = await reviewRes.json();
      setReview(reviewData);

      // Fetch stacks
      const stacksRes = await fetch('/api/stacks');
      if (!stacksRes.ok) return;
      const stacks = await stacksRes.json();
      const targetStack = isTeamReview
        ? stacks.find((s: any) => s.isCompany)
        : stacks.find((s: any) => !s.isCompany);
      if (!targetStack) return;
      setStackId(targetStack.id);

      // Fetch all goals
      const goalsUrl = isTeamReview
        ? '/api/goals?isCompany=true'
        : `/api/goals?stackId=${targetStack.id}`;
      const goalsRes = await fetch(goalsUrl);
      if (!goalsRes.ok) return;
      const fetchedGoalsRaw = await goalsRes.json();
      const fetchedGoals: Goal[] = Array.isArray(fetchedGoalsRaw) ? fetchedGoalsRaw : [];
      setAllGoals(fetchedGoals);

      // Primary goals at this level, filtered to current + next period (F2, G1)
      const allLevelGoals = fetchedGoals.filter((g: Goal) => g.level === goalLevel);
      const primary = filterByPeriod(allLevelGoals, goalLevel);
      setPrimaryGoals(primary);

      // Find parent goal (first parent for banner display)
      if (parentGoalLevel && primary.length > 0 && primary[0].parentId) {
        const parent = fetchedGoals.find((g: Goal) => g.id === primary[0].parentId);
        if (parent) setParentGoal(parent);
      }

      // Initialize editing state
      const editState: Record<string, { title: string; description: string; status: string }> = {};
      primary.forEach((g: Goal) => {
        editState[g.id] = { title: g.title, description: g.description ?? '', status: g.status };
      });
      setEditingGoals(editState);

      // Fetch KPIs for all filtered primary goals (F1: KPIs are already editable)
      const kpiGoals = getKpiGoals ? getKpiGoals(primary, fetchedGoals) : primary;
      const allKpis: Kpi[] = [];
      for (const goal of kpiGoals) {
        const kpiRes = await fetch(`/api/goals/${goal.id}/kpis`);
        if (kpiRes.ok) {
          const kpiData = await kpiRes.json();
          allKpis.push(...(kpiData.kpis ?? kpiData ?? []));
        }
      }
      setKpis(allKpis);

      // Child goals for "plan next period" - also filtered by period
      const allChildren = fetchedGoals.filter((g: Goal) => g.level === childGoalLevel);
      // For monthly review: show weekly goals belonging to current + next month's monthly goals
      // For yearly review: show monthly goals belonging to current + next year's strategic goals
      const primaryIds = new Set(primary.map((g) => g.id));
      const filteredChildren = allChildren.filter((g) => g.parentId && primaryIds.has(g.parentId));
      setChildGoals(filteredChildren.length > 0 ? filteredChildren : allChildren);

      // Determine next period parent
      if (findNextPeriodParent) {
        setNextPeriodParentId(findNextPeriodParent(primary, fetchedGoals));
      } else if (primary.length > 0) {
        setNextPeriodParentId(primary[0].id);
      }

      // Load saved answers
      const answersRes = await fetch(`/api/reviews/${reviewId}/answers`);
      if (answersRes.ok) {
        const answers: ReviewAnswer[] = await answersRes.json();
        const map: Record<string, ReviewAnswer> = {};
        answers.forEach((a) => { map[a.stepKey] = a; });

        if (map['difficulties']?.answerData?.text) setDifficulties(map['difficulties'].answerData.text);
        if (map['on-track']?.answerData?.assessments) setAssessments(map['on-track'].answerData.assessments);
        if (map['notes-completion']?.answerData?.text) setNotes(map['notes-completion'].answerData.text);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ---- Persist answer ---- */
  const persistAnswer = useCallback(async (stepKey: string, answerType: string, answerData: any) => {
    await fetch(`/api/reviews/${reviewId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepKey, answerType, answerData }),
    });
  }, [reviewId]);

  /* ---- Navigation ---- */
  const advanceStep = async () => {
    const step = steps[currentStep];

    // Validate steps that require user input
    if (step.key === 'difficulties' && !difficulties.trim()) {
      toast.error('Please add your reflections on successes and difficulties before continuing.');
      return;
    }

    if (step.key === 'difficulties') {
      await persistAnswer('difficulties', 'text', { text: difficulties });
    } else if (step.key === 'on-track') {
      await persistAnswer('on-track', 'goal_list', { assessments });
    } else if (step.key === 'notes-completion') {
      await persistAnswer('notes-completion', 'text', { text: notes });
      try {
        await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes, complete: true }),
        });
        setCompleted(true);
      } catch {
        toast.error('Failed to complete review. Please try again.');
      }
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  /* ---- KPI update ---- */
  const updateKpiActual = async (kpiId: string, value: number) => {
    setKpis((prev) => prev.map((k) => k.id === kpiId ? { ...k, actualValue: value } : k));
    await fetch(`/api/kpis/${kpiId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualValue: value }),
    });
  };

  /* ---- Goal editing ---- */
  const saveGoalEdit = async (goalId: string) => {
    const edit = editingGoals[goalId];
    if (!edit) return;
    await fetch(`/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: edit.title, description: edit.description, status: edit.status }),
    });
    setPrimaryGoals((prev) => prev.map((g) =>
      g.id === goalId ? { ...g, title: edit.title, description: edit.description, status: edit.status } : g
    ));
  };

  const addNewGoal = async () => {
    if (!newGoalTitle.trim() || !stackId) return;
    const parentId = parentGoal?.id ?? null;
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackId, parentId, level: goalLevel, title: newGoalTitle.trim() }),
    });
    if (res.ok) {
      const goal = await res.json();
      setPrimaryGoals((prev) => [...prev, goal]);
      setEditingGoals((prev) => ({
        ...prev,
        [goal.id]: { title: goal.title, description: '', status: goal.status },
      }));
      setNewGoalTitle('');
    }
  };

  /* ---- Plan next period ---- */
  const addChildGoal = async () => {
    if (!newChildTitle.trim() || !stackId) return;
    const parentId = nextPeriodParentId ?? (primaryGoals.length > 0 ? primaryGoals[0].id : null);
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackId, parentId, level: childGoalLevel, title: newChildTitle.trim() }),
    });
    if (res.ok) {
      const goal = await res.json();
      setChildGoals((prev) => [...prev, goal]);
      setNewChildTitle('');
    }
  };

  const updateChildGoal = async (goalId: string, title: string) => {
    setChildGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, title } : g));
    await fetch(`/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  };

  /* ---- Render ---- */

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading review...</div>;
  if (!review) return <div className="text-[var(--text-muted)] py-12 text-center">Review not found.</div>;

  if (completed) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <PartyPopper className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{completionTitle}</h2>
        <p className="text-[var(--text-muted)] mb-6">{completionMessage}</p>
        <button
          onClick={() => router.push('/reviews')}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Reviews
        </button>
      </m.div>
    );
  }

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === steps.length - 1;

  /* Determine which step key maps to "plan next period" */
  const planStepKey = steps.find((s) =>
    s.key.startsWith('plan-next-')
  )?.key;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-indigo-500' : 'bg-[var(--surface-raised)]'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <m.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          {/* Step header */}
          <div className="flex items-center gap-3">
            <StepIcon className="h-6 w-6 text-indigo-400" />
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Step {currentStep + 1} of {steps.length}: {step.title}
              </h2>
              <p className="text-[var(--text-muted)] text-sm">
                {stepDescriptions[step.key] ?? ''}
              </p>
            </div>
          </div>

          {/* Step content */}
          <div className="glass-panel p-6">
            {step.key === 'big-picture' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Start with the bigger picture. Your High Hard Goal and yearly vision keep you motivated and aligned.
                </p>
                {hierarchy.length > 0 ? (
                  hierarchy.map((group) => (
                    <div key={group.hhg.id} className="space-y-3">
                      {group.hhg.id !== '__ungrouped__' && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                          <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">High Hard Goal</p>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{group.hhg.title}</p>
                          {group.hhg.description && (
                            <p className="text-xs text-[var(--text-muted)] mt-1">{group.hhg.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                              <div className="h-full rounded-full bg-amber-500" style={{ width: `${group.hhg.progressPct}%` }} />
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">{Math.round(group.hhg.progressPct)}%</span>
                          </div>
                        </div>
                      )}
                      {group.yearlyGoals.map((yg) => (
                        <div key={yg.yearly.id} className="ml-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
                          <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium mb-0.5">Yearly Goal</p>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{yg.yearly.title}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${yg.yearly.progressPct}%` }} />
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">{Math.round(yg.yearly.progressPct)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                ) : parentGoal ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">Connected Goal</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{parentGoal.title}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${parentGoal.progressPct}%` }} />
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">{Math.round(parentGoal.progressPct)}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">No high-level goals found. Create a goal stack first.</p>
                )}
              </div>
            )}
            {step.key === 'current-goals' && (
              renderCurrentGoals
                ? renderCurrentGoals(primaryGoals, parentGoal, hierarchy)
                : <DefaultCurrentGoalsStep
                    goals={primaryGoals}
                    hierarchy={hierarchy}
                    goalLevel={goalLevel}
                    emptyMessage={emptyGoalsMessage}
                  />
            )}
            {step.key === 'difficulties' && (
              <DifficultiesStep
                value={difficulties}
                onChange={setDifficulties}
                placeholder={difficultiesPlaceholder}
                rows={difficultiesRows}
              />
            )}
            {step.key === 'successes-difficulties' && (
              <DifficultiesStep
                value={difficulties}
                onChange={setDifficulties}
                placeholder="Capture your successes and wins, then reflect on difficulties and blockers..."
                rows={difficultiesRows}
              />
            )}
            {step.key === 'hhg-assessment' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Is your High Hard Goal still the right one? Review it and adjust if needed.
                </p>
                {hierarchy.length > 0 && hierarchy[0]?.hhg && hierarchy[0].hhg.id !== '__ungrouped__' ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">High Hard Goal</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{hierarchy[0].hhg.title}</p>
                    {hierarchy[0].hhg.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">{hierarchy[0].hhg.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${hierarchy[0].hhg.progressPct}%` }} />
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">{Math.round(hierarchy[0].hhg.progressPct)}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">No High Hard Goal found.</p>
                )}
              </div>
            )}
            {(step.key === 'review-weekly' || step.key === 'review-monthly') && (
              <DefaultCurrentGoalsStep
                goals={primaryGoals}
                hierarchy={hierarchy}
                goalLevel={goalLevel}
                emptyMessage={`No ${childGoalLabel} goals found for review.`}
              />
            )}
            {step.key === 'kpi-progress' && (
              <KpiProgressStep
                kpis={kpis}
                onUpdate={updateKpiActual}
                emptyMessage={kpiEmptyMessage}
              />
            )}
            {step.key === 'on-track' && (
              <OnTrackStep
                goals={primaryGoals}
                assessments={assessments}
                onAssess={(goalId, value) => setAssessments((prev) => ({ ...prev, [goalId]: value }))}
                emptyMessage={onTrackEmptyMessage}
              />
            )}
            {step.key === 'goal-adjustment' && (
              <GoalAdjustmentStep
                goals={primaryGoals}
                editingGoals={editingGoals}
                onEdit={(goalId, field, value) =>
                  setEditingGoals((prev) => ({
                    ...prev,
                    [goalId]: { ...prev[goalId], [field]: value },
                  }))
                }
                onSave={saveGoalEdit}
                newGoalTitle={newGoalTitle}
                onNewGoalTitleChange={setNewGoalTitle}
                onAddGoal={addNewGoal}
                goalLevelLabel={goalLevelLabel}
              />
            )}
            {planStepKey && step.key === planStepKey && (
              <PlanNextPeriodStep
                childGoals={childGoals}
                parentGoals={primaryGoals}
                newTitle={newChildTitle}
                onNewTitleChange={setNewChildTitle}
                onAddGoal={addChildGoal}
                onUpdateGoal={updateChildGoal}
                description={planNextPeriodDescription}
                placeholder={planNextPeriodPlaceholder}
                goalLevel={goalLevel}
              />
            )}
            {step.key === 'notes-completion' && (
              <NotesCompletionStep
                value={notes}
                onChange={setNotes}
                placeholder={notesPlaceholder}
                rows={notesRows}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            <button
              onClick={advanceStep}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              {isLastStep ? 'Complete Review' : 'Next Step'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
