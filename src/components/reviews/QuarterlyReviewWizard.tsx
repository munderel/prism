'use client';

import {
  Target, TrendingUp, AlertTriangle, CheckCircle2, Edit3, Calendar, FileText,
} from 'lucide-react';
import { PeriodReviewWizard } from './PeriodReviewWizard';
import type { StepConfig } from './shared/review-types';

const STEPS: StepConfig[] = [
  { key: 'current-goals', title: 'Current Goals', icon: Target },
  { key: 'difficulties', title: 'Difficulties', icon: AlertTriangle },
  { key: 'kpi-progress', title: 'KPI Progress', icon: TrendingUp },
  { key: 'on-track', title: 'On-Track Assessment', icon: CheckCircle2 },
  { key: 'goal-adjustment', title: 'Goal Adjustment', icon: Edit3 },
  { key: 'plan-next-quarter', title: 'Plan Next Quarter', icon: Calendar },
  { key: 'notes-completion', title: 'Notes & Completion', icon: FileText },
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  'current-goals': 'Review your quarterly/strategic goals and how they connect to your HHG.',
  'difficulties': 'Reflect on friction, blockers, and difficulties you experienced this quarter.',
  'kpi-progress': 'Update your quarterly KPIs with actual values to track progress.',
  'on-track': 'Assess whether each strategic goal is on track, behind, or at risk.',
  'goal-adjustment': 'Modify, update, or add strategic goals as needed.',
  'plan-next-quarter': 'Refine monthly goals for the next quarter to stay on track.',
  'notes-completion': 'Add any final reflections or notes, then complete the review.',
};

export function QuarterlyReviewWizard({ reviewId }: { reviewId: string }) {
  return (
    <PeriodReviewWizard
      reviewId={reviewId}
      goalLevel="STRATEGIC"
      parentGoalLevel="HIGH_HARD"
      childGoalLevel="MONTHLY"
      periodLabel="quarter"
      steps={STEPS}
      stepDescriptions={STEP_DESCRIPTIONS}
      completionTitle="Quarterly Review Complete!"
      completionMessage="Excellent quarterly reflection. Your strategic awareness keeps you aligned with your goals."
      goalLevelLabel="strategic"
      childGoalLabel="monthly"
      parentGoalBannerLabel="Connected High Hard Goal"
      parentGoalBannerColor="amber"
      emptyGoalsMessage="No strategic goals found."
      difficultiesPlaceholder="What difficulties did you experience this quarter? (friction, blockers, strategic challenges...)"
      notesPlaceholder="What stood out this quarter? What strategic adjustments will you make?"
      kpiEmptyMessage="No KPIs found for your strategic goals."
      onTrackEmptyMessage="No strategic goals to assess."
      planNextPeriodDescription="Refine monthly goals for the upcoming quarter. These break your strategic goals into monthly targets."
      planNextPeriodPlaceholder="New monthly goal..."
      findNextPeriodParent={(primaryGoals) => {
        const now = new Date();
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const nextQuarterStartMonth = ((currentQuarter + 1) % 4) * 3;
        const nextQuarterYear = currentQuarter === 3 ? now.getFullYear() + 1 : now.getFullYear();
        const match = primaryGoals.find((g) => {
          if (!g.startDate) return false;
          const start = new Date(g.startDate);
          return start.getFullYear() === nextQuarterYear &&
            start.getMonth() >= nextQuarterStartMonth &&
            start.getMonth() < nextQuarterStartMonth + 3;
        });
        return match?.id ?? (primaryGoals.length > 0 ? primaryGoals[0].id : null);
      }}
    />
  );
}
