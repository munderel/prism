'use client';

import {
  Target, TrendingUp, AlertTriangle, CheckCircle2, Edit3, Calendar, FileText, Star,
} from 'lucide-react';
import { PeriodReviewWizard } from './PeriodReviewWizard';
import type { Goal, HhgGroup, StepConfig } from './shared/review-types';

const STEPS: StepConfig[] = [
  { key: 'current-goals', title: 'Current Goals', icon: Star },
  { key: 'difficulties', title: 'Difficulties', icon: AlertTriangle },
  { key: 'kpi-progress', title: 'KPI Progress', icon: TrendingUp },
  { key: 'on-track', title: 'On-Track Assessment', icon: CheckCircle2 },
  { key: 'goal-adjustment', title: 'Goal Adjustment', icon: Edit3 },
  { key: 'plan-next-year', title: 'Plan Next Year', icon: Calendar },
  { key: 'notes-completion', title: 'Notes & Completion', icon: FileText },
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  'current-goals': 'Review your High Hard Goals and yearly strategic objectives.',
  'difficulties': 'Reflect on the major friction, blockers, and challenges you faced this year.',
  'kpi-progress': 'Update your annual KPIs with actual values to track overall progress.',
  'on-track': 'Assess whether each strategic goal is on track, behind, or at risk.',
  'goal-adjustment': 'Modify, update, or add strategic goals for the coming year.',
  'plan-next-year': 'Refine monthly goals for the upcoming year to stay aligned with your HHG.',
  'notes-completion': 'Add any final reflections or notes, then complete the review.',
};

/**
 * Custom current-goals renderer for the yearly review.
 * Now uses the hierarchy built by PeriodReviewWizard to show HHG -> Yearly -> Monthly structure.
 */
function renderCurrentGoals(strategicGoals: Goal[], parentGoal: Goal | null, hierarchy: HhgGroup[]) {
  // If we have a hierarchy, use it for a richer display
  if (hierarchy.length > 0) {
    return <YearlyCurrentGoalsHierarchy groups={hierarchy} />;
  }
  // Fallback to flat display
  return <YearlyCurrentGoals strategicGoals={strategicGoals} hhgGoal={parentGoal} />;
}

function YearlyCurrentGoalsHierarchy({ groups }: { groups: HhgGroup[] }) {
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
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${group.hhg.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(group.hhg.progressPct)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Yearly strategic goals under this HHG */}
          {group.yearlyGoals.map((yearlyGroup) => (
            <div key={yearlyGroup.yearly.id} className="ml-4 space-y-3">
              {/* Yearly goal card */}
              <div className="flex items-start gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
                <Target className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium mb-0.5">Yearly Goal</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{yearlyGroup.yearly.title}</p>
                  {yearlyGroup.yearly.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{yearlyGroup.yearly.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      yearlyGroup.yearly.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      yearlyGroup.yearly.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                      yearlyGroup.yearly.status === 'ABANDONED' ? 'bg-red-500/20 text-red-400' :
                      'bg-[var(--surface-raised)] text-[var(--text-muted)]'
                    }`}>
                      {yearlyGroup.yearly.status.replace('_', ' ')}
                    </span>
                    {yearlyGroup.yearly.startDate && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(yearlyGroup.yearly.startDate).getFullYear()}
                      </span>
                    )}
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${yearlyGroup.yearly.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(yearlyGroup.yearly.progressPct)}%</span>
                  </div>
                </div>
              </div>

              {/* Monthly goals summary under this yearly */}
              {yearlyGroup.monthlyGoals.length > 0 && (
                <div className="ml-4 space-y-1">
                  <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">
                    Monthly Goals ({yearlyGroup.monthlyGoals.length})
                  </p>
                  {yearlyGroup.monthlyGoals.slice(0, 6).map((mg) => (
                    <div key={mg.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1 px-2 rounded bg-[var(--surface-raised)]/50">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{mg.title}</span>
                      <span className="text-[var(--text-muted)]">{Math.round(mg.progressPct)}%</span>
                    </div>
                  ))}
                  {yearlyGroup.monthlyGoals.length > 6 && (
                    <p className="text-xs text-[var(--text-muted)] pl-2">
                      +{yearlyGroup.monthlyGoals.length - 6} more
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Fallback flat display when hierarchy is not available */
function YearlyCurrentGoals({ strategicGoals, hhgGoal }: { strategicGoals: Goal[]; hhgGoal: Goal | null }) {
  return (
    <div className="space-y-6">
      {/* HHG section */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          High Hard Goals
        </h3>
        {!hhgGoal ? (
          <p className="text-[var(--text-muted)] text-sm italic">No HHG goals found.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{hhgGoal.title}</p>
                  {hhgGoal.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{hhgGoal.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${hhgGoal.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(hhgGoal.progressPct)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Strategic goals section */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          Yearly Strategic Goals
        </h3>
        {strategicGoals.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm italic">No strategic goals found.</p>
        ) : (
          <div className="space-y-3">
            {strategicGoals.map((goal) => (
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
        )}
      </div>
    </div>
  );
}

export function YearlyReviewWizard({ reviewId }: { reviewId: string }) {
  return (
    <PeriodReviewWizard
      reviewId={reviewId}
      goalLevel="STRATEGIC"
      parentGoalLevel="HIGH_HARD"
      childGoalLevel="MONTHLY"
      periodLabel="year"
      steps={STEPS}
      stepDescriptions={STEP_DESCRIPTIONS}
      completionTitle="Yearly Review Complete!"
      completionMessage="Incredible work completing your annual review. This level of strategic reflection is what separates exceptional performers from the rest."
      goalLevelLabel="strategic"
      childGoalLabel="monthly"
      difficultiesPlaceholder="What were the biggest challenges, blockers, and friction points this year? Think about systemic issues, not just individual events..."
      difficultiesRows={8}
      notesPlaceholder="What defined this year? What are you most proud of? What will you change going forward?"
      notesRows={8}
      kpiEmptyMessage="No KPIs found for your yearly goals."
      onTrackEmptyMessage="No strategic goals to assess."
      planNextPeriodDescription="Refine monthly goals for the upcoming year. Align these with your HHG and strategic objectives."
      planNextPeriodPlaceholder="New monthly goal for next year..."
      renderCurrentGoals={renderCurrentGoals}
      getKpiGoals={(primaryGoals, allGoals) => {
        const hhgGoals = allGoals.filter((g) => g.level === 'HIGH_HARD');
        return [...hhgGoals, ...primaryGoals];
      }}
      findNextPeriodParent={(primaryGoals) => {
        const nextYear = new Date().getFullYear() + 1;
        const match = primaryGoals.find((g) => {
          if (!g.startDate) return false;
          return new Date(g.startDate).getFullYear() === nextYear;
        });
        return match?.id ?? (primaryGoals.length > 0 ? primaryGoals[primaryGoals.length - 1].id : null);
      }}
    />
  );
}
