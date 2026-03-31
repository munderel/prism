'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useToast } from '@/components/ui/ToastProvider';
import {
  ChevronRight, ChevronLeft, PartyPopper,
  Target, ListTodo, AlertTriangle, Star, Calendar,
  Wrench, BarChart3, FileText, CalendarClock,
} from 'lucide-react';

import { getLocalDateString } from '@/lib/date-utils';
import { StepCurrentGoals } from './weekly-steps/StepCurrentGoals';
import { StepReviewTasks } from './weekly-steps/StepReviewTasks';
import { StepTop3Tasks } from './weekly-steps/StepTop3Tasks';
import { SuccessesAndDifficultiesStep } from './shared/SuccessesAndDifficultiesStep';
import { StepMaintenanceReview } from './weekly-steps/StepMaintenanceReview';
import { StepKpiProgress } from './weekly-steps/StepKpiProgress';
import { StepNotesCompletion } from './weekly-steps/StepNotesCompletion';
import { StepWeeklyGoals } from './weekly-steps/StepWeeklyGoals';
import { InlineTaskCreator } from './weekly-steps/InlineTaskCreator';

const CalendarSplitView = dynamic(
  () => import('@/components/calendar/CalendarSplitView').then(m => m.CalendarSplitView),
  { ssr: false, loading: () => <div className="text-[var(--text-muted)] py-8 text-center">Loading calendar...</div> }
);

// Step definitions — reordered per Prism overhaul spec (2026-03-28)
// 1. Current Goals → 2. Review Tasks (successes captured) → 3. KPI Progress →
// 4. Successes & Difficulties → 5. Create/Adjust Weekly Goals →
// 6. Create/Modify Tasks → 7. Rank Top 3 → 8. Calendar: Work Blocks →
// 9. Calendar: Tasks into Blocks → 10. Maintenance → 11. Notes
const STEPS = [
  { key: 'current_goals',     title: 'Current Goals',                       icon: Target,         description: 'Review your current weekly and monthly goals grouped by hierarchy.' },
  { key: 'review_tasks',      title: 'Review Previous Tasks',               icon: ListTodo,       description: 'Check off completed tasks. Incomplete tasks carry forward. Capture successes.' },
  { key: 'kpi_progress',      title: 'KPI Progress',                        icon: BarChart3,      description: 'Update weekly KPI actuals and review goal progress.' },
  { key: 'successes_difficulties', title: 'Successes & Difficulties',       icon: AlertTriangle,  description: 'Capture wins and reflect on blockers from the past week.' },
  { key: 'weekly_goals',      title: 'Create & Adjust Weekly Goals',        icon: Target,         description: 'Create weekly goals from monthly, with goal creation coach.' },
  { key: 'create_tasks',      title: 'Create & Modify Tasks',               icon: ListTodo,       description: 'Add tasks linked to goals. Default assign self or select team member.' },
  { key: 'mit',               title: 'Rank Top 3 Most Important Tasks',     icon: Star,           description: 'Select #1, then #2, then #3 most important tasks for this week.' },
  { key: 'work_blocks',       title: 'Calendar: Create Work Blocks',        icon: Calendar,       description: 'Create Deep Work, Normal Work, and AIM blocks on your calendar.' },
  { key: 'schedule_tasks',    title: 'Calendar: Tasks into Blocks',         icon: CalendarClock,  description: 'Drag tasks and AIMs into your work blocks.' },
  { key: 'maintenance',       title: 'Maintenance Review',                  icon: Wrench,         description: 'Keep, automate, or eliminate maintenance tasks.' },
  { key: 'notes_completion',  title: 'Notes & Completion',                  icon: FileText,       description: 'Add final notes and complete the review.' },
] as const;

const TOTAL_STEPS = STEPS.length;

interface WorkBlock {
  id: string;
  name: string;
  type: 'deep_work' | 'normal' | 'aim';
  durationMinutes: number;
  preferredTime: string;
}

interface ReviewAnswerData {
  stepKey: string;
  answerType: string;
  answerData: any;
}

interface WeeklyReviewWizardProps {
  reviewId: string;
  isTeamReview?: boolean;
}

export function WeeklyReviewWizard({ reviewId, isTeamReview }: WeeklyReviewWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const _scope = isTeamReview ? 'company' : 'personal';
  // URL step param is 1-based for user-friendliness; internal state is 0-based
  const urlStep = searchParams.get('step');
  const initialStep = urlStep ? Math.max(0, Math.min(parseInt(urlStep, 10) - 1, TOTAL_STEPS - 1)) : 0;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  // Step-specific state
  const [successes, setSuccesses] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const [mitTaskIds, setMitTaskIds] = useState<string[]>([]);
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([]);
  const [maintenanceDecisions, setMaintenanceDecisions] = useState<Record<string, any>>({});
  const [maintenanceTaskCount, setMaintenanceTaskCount] = useState(0);
  const [kpiNotes, setKpiNotes] = useState('');
  const [taskBlockAssignments, setTaskBlockAssignments] = useState<Record<string, string>>({});
  const [finalNotes, setFinalNotes] = useState('');

  // Answers map for hydration
  const [_answers, setAnswers] = useState<Record<string, ReviewAnswerData>>({});

  // Upcoming week boundaries (Mon-Sun)
  const upcomingWeekStart = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const off = dow === 0 ? -6 : 1 - dow;
    const d = new Date(now);
    d.setDate(now.getDate() + off);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const upcomingWeekEnd = useMemo(() => {
    const d = new Date(upcomingWeekStart);
    d.setDate(upcomingWeekStart.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [upcomingWeekStart]);
  const upcomingWeekStartStr = getLocalDateString(upcomingWeekStart);
  const upcomingWeekEndStr = getLocalDateString(upcomingWeekEnd);

  // Fetch unscheduled tasks and AIM instances for calendar steps
  const { data: weekTasks } = useSWR('/api/tasks?includeUnscheduled=true');
  const { data: weekAims } = useSWR(
    `/api/aims/instances?start=${upcomingWeekStartStr}T00:00:00&end=${upcomingWeekEndStr}T23:59:59`
  );

  // Fetch user aims for AIM block duration (calendar work blocks)
  const { data: userAimsData } = useSWR('/api/aims/user');
  const aimBlockDuration = useMemo(() => {
    if (!Array.isArray(userAimsData)) return 60;
    const activeAims = userAimsData.filter((ua: any) => ua.isActive && ua.aimCategory);
    if (activeAims.length === 0) return 60;
    // Use minimum effective duration across active aims
    const durations = activeAims.map((ua: any) => {
      const baseDuration = ua.customDuration ?? ua.aimCategory.defaultDurationMin ?? 60;
      const phase = ua.currentPhase ?? 'FLOW';
      if (phase === 'SEED') {
        const weeksInPhase = Math.floor((Date.now() - new Date(ua.phaseStartedAt).getTime()) / (7 * 24 * 60 * 60 * 1000));
        return Math.min(baseDuration, 5 + weeksInPhase * 5);
      }
      if (phase === 'SPROUT') return Math.max(5, Math.round(baseDuration * 0.5));
      if (phase === 'GROW') return Math.max(5, Math.round(baseDuration * 0.75));
      return baseDuration;
    });
    return Math.min(...durations);
  }, [userAimsData]);

  // Fetch upcoming week goals to build goalId filter set for Step 9
  const { data: upcomingGoalsData } = useSWR('/api/goals?level=WEEKLY');
  const upcomingWeekGoalIds = useMemo(() => {
    if (!Array.isArray(upcomingGoalsData)) return new Set<string>();
    return new Set(
      upcomingGoalsData
        .filter((g: any) => {
          if (!g.startDate || !g.endDate) return false;
          const gs = new Date(g.startDate);
          const ge = new Date(g.endDate);
          return gs <= upcomingWeekEnd && ge >= upcomingWeekStart;
        })
        .map((g: any) => g.id)
    );
  }, [upcomingGoalsData, upcomingWeekStart, upcomingWeekEnd]);

  // Fetch personal stack goals for broader task filtering (Step 9)
  const { data: stacksData } = useSWR('/api/stacks');
  const personalStackId = useMemo(() => {
    if (!Array.isArray(stacksData)) return null;
    return stacksData.find((s: any) => !s.isCompany)?.id ?? null;
  }, [stacksData]);
  const { data: personalGoalsData } = useSWR(
    personalStackId ? `/api/goals?stackId=${personalStackId}` : null
  );
  const personalGoalIds = useMemo(() => {
    if (!Array.isArray(personalGoalsData)) return new Set<string>();
    return new Set(personalGoalsData.map((g: any) => g.id));
  }, [personalGoalsData]);

  const unscheduledForCalendar = useMemo(() => {
    const items: any[] = [];
    // Tasks filtered for Step 9: upcoming week goals, maintenance, react, personal goal stack
    if (Array.isArray(weekTasks)) {
      for (const t of weekTasks) {
        if (t.status === 'DONE' || t.status === 'DROPPED') continue;
        if (t.timeBlockStart) continue;
        const dueDateInWeek = t.dueDate &&
          new Date(t.dueDate) >= upcomingWeekStart &&
          new Date(t.dueDate) <= upcomingWeekEnd;
        const include =
          (t.goalId && upcomingWeekGoalIds.has(t.goalId)) || // linked to upcoming week goal
          (t.taskType === 'MAINTENANCE' && dueDateInWeek) || // maintenance due this week
          t.taskType === 'REACT' ||                          // all open react tasks
          (t.goalId && personalGoalIds.has(t.goalId)) ||     // part of personal goal stack
          dueDateInWeek ||                                   // any task due this week
          (!t.goalId && !t.dueDate && t.status === 'TODO');  // unlinked TODO tasks
        if (include) {
          items.push({ id: t.id, itemType: 'task', title: t.title, duration: t.estimatedMinutes || 60, taskType: t.taskType, priority: t.priority });
        }
      }
    }
    // AIM instances without time blocks (duration from AIM category)
    if (Array.isArray(weekAims)) {
      for (const a of weekAims) {
        if (!a.timeBlockStart && a.status !== 'COMPLETED') {
          items.push({ id: a.id, itemType: 'aim', title: a.aimCategory?.name || 'AIM', duration: a.aimCategory?.defaultDurationMin || 60, aimCategoryId: a.aimCategoryId });
        }
      }
    }
    return items;
  }, [weekTasks, weekAims, upcomingWeekGoalIds, personalGoalIds, upcomingWeekStart, upcomingWeekEnd]);

  useEffect(() => {
    fetchReviewAndAnswers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  const fetchReviewAndAnswers = async () => {
    try {
      // Fetch review
      const reviewRes = await fetch(`/api/reviews/${reviewId}`);
      if (reviewRes.ok) {
        const reviewData = await reviewRes.json();
        setReview(reviewData);

        if (reviewData.completedAt) {
          setCompleted(true);
          setLoading(false);
          return;
        }
      }

      // Fetch existing answers to hydrate state
      const answersRes = await fetch(`/api/reviews/${reviewId}/answers`);
      if (answersRes.ok) {
        const answersData: ReviewAnswerData[] = await answersRes.json();
        const answersMap: Record<string, ReviewAnswerData> = {};

        for (const ans of answersData) {
          answersMap[ans.stepKey] = ans;

          // Hydrate step state from saved answers
          switch (ans.stepKey) {
            case 'successes_difficulties':
              setSuccesses((ans.answerData as any)?.successes ?? []);
              setDifficulties((ans.answerData as any)?.difficulties ?? []);
              break;
            case 'difficulties':
              // Legacy support
              setDifficulties(typeof (ans.answerData as any)?.text === 'string'
                ? [(ans.answerData as any).text]
                : (ans.answerData as any)?.difficulties ?? []);
              break;
            // Support both legacy 'top3' key and new 'mit' key
            case 'top3':
            case 'mit':
              setMitTaskIds((ans.answerData as any)?.taskIds ?? []);
              break;
            case 'work_blocks':
              setWorkBlocks((ans.answerData as any)?.blocks ?? []);
              break;
            case 'maintenance':
              setMaintenanceDecisions((ans.answerData as any)?.decisions ?? {});
              break;
            case 'kpi_progress':
              setKpiNotes((ans.answerData as any)?.notes ?? '');
              break;
            case 'schedule_tasks':
              setTaskBlockAssignments((ans.answerData as any)?.assignments ?? {});
              break;
            case 'notes_completion':
              setFinalNotes((ans.answerData as any)?.notes ?? '');
              break;
          }
        }

        setAnswers(answersMap);

        // Resume from first unanswered step (unless URL step was specified)
        if (!urlStep) {
          const answeredKeys = new Set(answersData.map((a) => a.stepKey));
          let resumeStep = 0;
          for (let i = 0; i < STEPS.length; i++) {
            if (!answeredKeys.has(STEPS[i].key)) {
              resumeStep = i;
              break;
            }
            resumeStep = i + 1;
          }
          setCurrentStep(Math.min(resumeStep, TOTAL_STEPS - 1));
        }
      }
    } catch (err) {
      console.error('Failed during review operation:', err);
    }
    setLoading(false);
  };

  const handleCreateWorkBlock = useCallback(async (start: Date, end: Date) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: 'Work Block',
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });
      if (!res.ok) toast.error('Failed to create work block. Is Google Calendar connected?');
    } catch {
      toast.error('Failed to create work block.');
    }
  }, [toast]);

  const persistAnswer = useCallback(async (stepKey: string, answerType: string, answerData: any) => {
    try {
      await fetch(`/api/reviews/${reviewId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepKey, answerType, answerData }),
      });
    } catch (err) {
      console.error('Failed to persist review answer:', err);
    }
  }, [reviewId]);

  const persistCurrentStep = useCallback(async () => {
    const step = STEPS[currentStep];
    switch (step.key) {
      case 'current_goals':
        await persistAnswer('current_goals', 'viewed', { viewed: true });
        break;
      case 'review_tasks':
        await persistAnswer('review_tasks', 'task_list', { reviewed: true });
        break;
      case 'successes_difficulties':
        await persistAnswer('successes_difficulties', 'text_list', { successes, difficulties });
        break;
      case 'create_tasks':
        await persistAnswer('create_tasks', 'viewed', { viewed: true });
        break;
      case 'mit':
        await persistAnswer('mit', 'priority_ranking', { taskIds: mitTaskIds });
        // Flag selected tasks as Win the Day so dashboard shows them
        for (const taskId of mitTaskIds) {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isWinTheDay: true }),
          });
        }
        break;
      case 'work_blocks':
        await persistAnswer('work_blocks', 'work_blocks', { blocks: workBlocks });
        break;
      case 'weekly_goals':
        await persistAnswer('weekly_goals', 'viewed', { viewed: true });
        break;
      case 'maintenance':
        await persistAnswer('maintenance', 'maintenance_decisions', { decisions: maintenanceDecisions });
        break;
      case 'kpi_progress':
        await persistAnswer('kpi_progress', 'kpi_progress', { notes: kpiNotes });
        break;
      case 'schedule_tasks':
        await persistAnswer('schedule_tasks', 'task_block_assignments', { assignments: taskBlockAssignments });
        break;
      case 'notes_completion':
        await persistAnswer('notes_completion', 'text', { notes: finalNotes });
        break;
    }
  }, [currentStep, successes, difficulties, mitTaskIds, workBlocks, maintenanceDecisions, kpiNotes, taskBlockAssignments, finalNotes, persistAnswer]);

  // Validate current step before advancing
  const validateCurrentStep = (): string | null => {
    const stepKey = STEPS[currentStep].key;
    switch (stepKey) {
      case 'successes_difficulties':
        if (successes.length === 0 && difficulties.length === 0) {
          return 'Please add at least one success or difficulty before continuing.';
        }
        break;
      case 'mit':
        if (mitTaskIds.length < 3) {
          return `Please select your top 3 most important tasks (${mitTaskIds.length}/3 selected).`;
        }
        break;
      case 'maintenance':
        if (maintenanceTaskCount > 0) {
          const decidedCount = Object.keys(maintenanceDecisions).length;
          if (decidedCount < maintenanceTaskCount) {
            return `Please choose Keep, Automate, or Eliminate for all maintenance tasks (${decidedCount}/${maintenanceTaskCount} decided).`;
          }
        }
        break;
    }
    return null;
  };

  const advanceStep = async () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    await persistCurrentStep();

    if (currentStep === TOTAL_STEPS - 1) {
      try {
        await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: finalNotes, complete: true }),
        });
        setCompleted(true);
      } catch {
        toast.error('Failed to complete review. Please try again.');
      }
      return;
    }

    setCurrentStep(currentStep + 1);
  };

  const goBack = async () => {
    if (currentStep > 0) {
      // Persist before going back too
      await persistCurrentStep();
      setCurrentStep(currentStep - 1);
    }
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] py-12 text-center">Loading review...</div>;
  }

  if (!review) {
    return <div className="text-[var(--text-muted)] py-12 text-center">Review not found.</div>;
  }

  if (completed) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <PartyPopper className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Weekly Review Complete!</h2>
        <p className="text-[var(--text-muted)] mb-6">
          Great work reflecting on your week. You&apos;re set up for a productive week ahead.
        </p>
        <button
          onClick={() => router.push('/reviews')}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Reviews
        </button>
      </m.div>
    );
  }

  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === TOTAL_STEPS - 1;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-1.5 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-indigo-500' : 'bg-[var(--surface-raised)]'
            }`}
          />
        ))}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => {
                // Allow clicking only on completed or current steps
                if (i <= currentStep) {
                  persistCurrentStep();
                  setCurrentStep(i);
                }
              }}
              disabled={i > currentStep}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all whitespace-nowrap ${
                i === currentStep
                  ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                  : i < currentStep
                  ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 cursor-pointer'
                  : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{i + 1}</span>
            </button>
          );
        })}
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
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StepIcon className="h-5 w-5 text-indigo-400" />
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Step {currentStep + 1} of {TOTAL_STEPS}: {step.title}
              </h2>
            </div>
            <p className="text-[var(--text-muted)] text-sm">{step.description}</p>
          </div>

          {/* Step content */}
          <div className="glass-panel p-6">
            {step.key === 'current_goals' && (
              <StepCurrentGoals reviewId={reviewId} isTeamReview={isTeamReview} />
            )}
            {step.key === 'review_tasks' && (
              <StepReviewTasks reviewId={reviewId} />
            )}
            {step.key === 'kpi_progress' && (
              <StepKpiProgress
                reviewId={reviewId}
                initialNotes={kpiNotes}
                onNotesChange={setKpiNotes}
                isTeamReview={isTeamReview}
              />
            )}
            {step.key === 'successes_difficulties' && (
              <SuccessesAndDifficultiesStep
                reviewId={reviewId}
                initialSuccesses={successes}
                initialDifficulties={difficulties}
                onSave={(s, d) => { setSuccesses(s); setDifficulties(d); }}
              />
            )}
            {step.key === 'weekly_goals' && (
              <StepWeeklyGoals reviewId={reviewId} isTeamReview={isTeamReview} />
            )}
            {step.key === 'create_tasks' && (
              <InlineTaskCreator isTeamReview={isTeamReview} />
            )}
            {step.key === 'mit' && (
              <StepTop3Tasks
                reviewId={reviewId}
                selectedTaskIds={mitTaskIds}
                onSelectionChange={setMitTaskIds}
                isTeamReview={isTeamReview}
              />
            )}
            {step.key === 'work_blocks' && (
              isTeamReview ? (
                <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">Calendar scheduling is done individually.</p>
                </div>
              ) : (
              <>
                <div className="text-center py-4">
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Create Deep Work, Normal Work, and AIM blocks on your weekly calendar.
                  </p>
                  <button
                    onClick={() => setCalendarModalOpen(true)}
                    className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                  >
                    Open Calendar
                  </button>
                </div>
                {calendarModalOpen && (
                  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-start justify-center pt-[72px] px-2 pb-2">
                    <div className="bg-[var(--surface-default,#fff)] dark:bg-[var(--surface-default,#1a1a2e)] rounded-xl w-full max-w-[98vw] h-[calc(100vh-80px)] flex flex-col overflow-hidden shadow-2xl">
                      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)]">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{step.title}</h3>
                        <button
                          onClick={() => setCalendarModalOpen(false)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden p-2">
                        <CalendarSplitView
                          mode="work_blocks"
                          viewMode="week"
                          dateRange={{ start: `${upcomingWeekStartStr}T00:00:00`, end: `${upcomingWeekEndStr}T23:59:59` }}
                          unscheduledItems={unscheduledForCalendar}
                          aimBlockDuration={aimBlockDuration}
                          onCreateWorkBlock={handleCreateWorkBlock}
                          onSchedule={async (itemId, itemType, start, end) => {
                            const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
                            await fetch(endpoint, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ timeBlockStart: start.toISOString(), timeBlockEnd: end.toISOString() }),
                            });
                          }}
                          onUnschedule={async (itemId, itemType) => {
                            const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
                            await fetch(endpoint, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
              )
            )}
            {step.key === 'schedule_tasks' && (
              isTeamReview ? (
                <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">Calendar scheduling is done individually.</p>
                </div>
              ) : (
              <>
                <div className="text-center py-4">
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Drag your tasks and AIMs into the work blocks you created.
                  </p>
                  <button
                    onClick={() => setCalendarModalOpen(true)}
                    className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                  >
                    Open Calendar
                  </button>
                </div>
                {calendarModalOpen && (
                  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-start justify-center pt-[72px] px-2 pb-2">
                    <div className="bg-[var(--surface-default,#fff)] dark:bg-[var(--surface-default,#1a1a2e)] rounded-xl w-full max-w-[98vw] h-[calc(100vh-80px)] flex flex-col overflow-hidden shadow-2xl">
                      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)]">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{step.title}</h3>
                        <button
                          onClick={() => setCalendarModalOpen(false)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden p-2">
                        <CalendarSplitView
                          mode="schedule_tasks"
                          viewMode="week"
                          dateRange={{ start: `${upcomingWeekStartStr}T00:00:00`, end: `${upcomingWeekEndStr}T23:59:59` }}
                          unscheduledItems={unscheduledForCalendar}
                          onSchedule={async (itemId, itemType, start, end) => {
                            const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
                            await fetch(endpoint, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ timeBlockStart: start.toISOString(), timeBlockEnd: end.toISOString() }),
                            });
                          }}
                          onUnschedule={async (itemId, itemType) => {
                            const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
                            await fetch(endpoint, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
              )
            )}
            {step.key === 'maintenance' && (
              <StepMaintenanceReview
                reviewId={reviewId}
                initialDecisions={maintenanceDecisions}
                onDecisionsChange={setMaintenanceDecisions}
                onTaskCountChange={setMaintenanceTaskCount}
                isTeamReview={isTeamReview}
              />
            )}
            {step.key === 'notes_completion' && (
              <StepNotesCompletion
                reviewId={reviewId}
                initialNotes={finalNotes}
                onNotesChange={setFinalNotes}
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
