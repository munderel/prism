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
  { key: 'plan-next-month', title: 'Plan Next Month', icon: Calendar },
  { key: 'notes-completion', title: 'Notes & Completion', icon: FileText },
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  'current-goals': 'Review your monthly goals and how they connect to your yearly objectives.',
  'difficulties': 'Reflect on friction, blockers, and difficulties you experienced this month.',
  'kpi-progress': 'Update your monthly KPIs with actual values to track progress.',
  'on-track': 'Assess whether each monthly goal is on track, behind, or at risk.',
  'goal-adjustment': 'Modify, update, or add monthly goals as needed.',
  'plan-next-month': 'Plan weekly goals for next month to stay on track.',
  'notes-completion': 'Add any final reflections or notes, then complete the review.',
};

export function MonthlyReviewWizard({ reviewId }: { reviewId: string }) {
  return (
    <PeriodReviewWizard
      reviewId={reviewId}
      goalLevel="MONTHLY"
      parentGoalLevel="STRATEGIC"
      childGoalLevel="WEEKLY"
      periodLabel="month"
      steps={STEPS}
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
      planNextPeriodDescription="Plan your weekly goals for next month. These will break down into actionable weekly targets."
      planNextPeriodPlaceholder="New weekly goal..."
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
