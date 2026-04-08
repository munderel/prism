'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Target, TrendingUp, CheckCircle2, Edit3, Calendar, FileText, Eye, Trophy, BarChart3,
} from 'lucide-react';
import { PeriodReviewWizard } from './PeriodReviewWizard';
import type { Goal, StepConfig } from './shared/review-types';
import { getLocalDateString } from '@/lib/date-utils';

// Monthly review steps — reordered per Prism overhaul spec (2026-03-28)
// 1. Big Picture (HHG + yearly) → 2. Current Monthly Goals (expandable to weekly) →
// 3. Review Weekly Goals → 4. Successes & Difficulties → 5. Weekly KPI Progress →
// 5a. [Process KPI Log (conditional)] → 6. On-Track Assessment → 7. Modify Goals →
// 8. Create Weekly Goals (with coach) → 9. Notes
const STEPS_BASE: StepConfig[] = [
  { key: 'big-picture', title: 'Big Picture', icon: Eye },
  { key: 'current-goals', title: 'Current Monthly Goals', icon: Target },
  { key: 'review-weekly', title: 'Review Weekly Goals', icon: TrendingUp },
  { key: 'successes-difficulties', title: 'Successes & Difficulties', icon: Trophy },
  { key: 'kpi-progress', title: 'Weekly KPI Progress', icon: TrendingUp },
  { key: 'on-track', title: 'On-Track Assessment', icon: CheckCircle2 },
  { key: 'goal-adjustment', title: 'Modify Goals', icon: Edit3 },
  { key: 'plan-next-month', title: 'Create Weekly Goals', icon: Calendar },
  { key: 'notes-completion', title: 'Notes & Completion', icon: FileText },
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  'big-picture': 'Start with your High Hard Goal and yearly vision for motivation. Remember the bigger picture.',
  'current-goals': 'Review your monthly goals, expandable to see weekly breakdowns.',
  'review-weekly': 'Review completed and incomplete weekly goals for the month.',
  'successes-difficulties': 'Capture wins and successes, then reflect on difficulties and blockers.',
  'kpi-progress': 'Update weekly KPI actuals to track progress toward monthly targets.',
  'on-track': 'Assess each weekly goal. This auto-fills the monthly on-track status.',
  'goal-adjustment': 'Modify weekly and monthly goals at all levels. Drag to reorder weekly goal sequence.',
  'plan-next-month': 'Create weekly goals with KPIs for the upcoming month. Goal creation coach available.',
  'notes-completion': 'Add any final reflections or notes, then complete the review.',
};

export function MonthlyReviewWizard({ reviewId, isTeamReview }: { reviewId: string; isTeamReview?: boolean }) {
  const [dueKpiProcesses, setDueKpiProcesses] = useState<Array<{ process: any; kpis: any[] }>>([]);

  useEffect(() => {
    const today = getLocalDateString();
    fetch(`/api/processes/kpis/due?period=monthly&date=${today}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setDueKpiProcesses(Array.isArray(data) ? data : []))
      .catch(() => {}); // non-critical
  }, []);

  const steps = useMemo((): StepConfig[] => {
    const idx = STEPS_BASE.findIndex((s) => s.key === 'kpi-progress');
    if (dueKpiProcesses.length === 0 || idx === -1) return STEPS_BASE;
    const result = [...STEPS_BASE];
    result.splice(idx + 1, 0, { key: 'process_kpi_log', title: 'Process KPI Log', icon: BarChart3 });
    return result;
  }, [dueKpiProcesses]);

  return (
    <PeriodReviewWizard
      reviewId={reviewId}
      isTeamReview={isTeamReview}
      steps={steps}
      processKpiData={dueKpiProcesses}
      goalLevel="MONTHLY"
      parentGoalLevel="STRATEGIC"
      childGoalLevel="WEEKLY"
      periodLabel="month"
      stepDescriptions={STEP_DESCRIPTIONS}
      completionTitle="Monthly Review Complete!"
      completionMessage="Great work reflecting on your monthly progress. Keep pushing toward your goals."
      goalLevelLabel="monthly"
      childGoalLabel="weekly"
      parentGoalBannerLabel="Connected Yearly Goal"
      emptyGoalsMessage="No monthly goals found."
      difficultiesPlaceholder="What difficulties did you experience this month? (friction, blockers, challenges...)"
      notesPlaceholder="What stood out this month? What will you do differently?"
      kpiEmptyMessage="No KPIs found for your monthly goals."
      onTrackEmptyMessage="No monthly goals to assess."
      planNextPeriodDescription="Create weekly goals with KPIs for the upcoming month. Use the goal creation coach for guidance."
      planNextPeriodPlaceholder="New weekly goal..."
      getKpiGoals={(primaryGoals: Goal[], allGoals: Goal[]) => {
        // Fetch KPIs from weekly goals (children of monthly goals) instead of monthly goals themselves
        const primaryIds = new Set(primaryGoals.map((g) => g.id));
        const weeklyGoals = allGoals.filter(
          (g) => g.level === 'WEEKLY' && g.parentId && primaryIds.has(g.parentId)
        );
        // Include both monthly and weekly KPIs
        return [...primaryGoals, ...weeklyGoals];
      }}
      findNextPeriodParent={(primaryGoals) => {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const match = primaryGoals.find((g) => {
          if (!g.startDate) return false;
          const start = new Date(g.startDate);
          return start.getMonth() === nextMonth.getMonth() && start.getFullYear() === nextMonth.getFullYear();
        });
        return match?.id ?? null;
      }}
    />
  );
}
