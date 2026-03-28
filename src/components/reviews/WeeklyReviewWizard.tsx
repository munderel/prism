'use client';

import { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, ChevronLeft, PartyPopper,
  Target, ListTodo, AlertTriangle, Star, Calendar,
  Wrench, Brain, BarChart3, FileText, CalendarClock,
} from 'lucide-react';

import { StepCurrentGoals } from './weekly-steps/StepCurrentGoals';
import { StepReviewTasks } from './weekly-steps/StepReviewTasks';
import { StepDifficulties } from './weekly-steps/StepDifficulties';
import { StepTop3Tasks } from './weekly-steps/StepTop3Tasks';
import { StepCalendarPlanning } from './weekly-steps/StepCalendarPlanning';
import { StepMaintenanceReview } from './weekly-steps/StepMaintenanceReview';
import { StepKpiProgress } from './weekly-steps/StepKpiProgress';
import { StepNotesCompletion } from './weekly-steps/StepNotesCompletion';
import { StepWeeklyGoals } from './weekly-steps/StepWeeklyGoals';
import { StepScheduleTasks } from './weekly-steps/StepScheduleTasks';

// Step definitions — reordered per E1-E7 spec
const STEPS = [
  { key: 'current_goals',     title: 'Current Goals',                  icon: Target,         description: 'Review your current weekly and monthly goals grouped by hierarchy.' },
  { key: 'review_tasks',      title: 'Review Previous Tasks',          icon: ListTodo,       description: 'Check off completed tasks and reschedule incomplete ones.' },
  { key: 'difficulties',      title: 'Difficulties',                   icon: AlertTriangle,  description: 'Reflect on blockers and friction from the past week.' },
  { key: 'mit',               title: 'Select Your #1 Most Important Task', icon: Star,       description: 'Choose the single most important task for this week.' },
  { key: 'work_blocks',       title: 'Plan Your Work Blocks',          icon: Calendar,       description: 'Create deep work, normal, and AIM blocks for the week.' },
  { key: 'weekly_goals',      title: 'Review & Create Weekly Goals',   icon: Target,         description: 'Review existing weekly goals, create new ones, and add KPIs.' },
  { key: 'maintenance',       title: 'Maintenance Review',             icon: Wrench,         description: 'Keep, automate, or eliminate maintenance tasks.' },
  { key: 'kpi_progress',      title: 'KPI Progress',                   icon: BarChart3,      description: 'Update KPI actuals and review goal progress.' },
  { key: 'schedule_tasks',    title: 'Schedule Tasks into Blocks',     icon: CalendarClock,  description: 'Assign remaining tasks to work blocks.' },
  { key: 'notes_completion',  title: 'Notes & Completion',             icon: FileText,       description: 'Add final notes and complete the review.' },
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
}

export function WeeklyReviewWizard({ reviewId }: WeeklyReviewWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [review, setReview] = useState<any>(null);

  // Step-specific state
  const [difficulties, setDifficulties] = useState('');
  const [mitTaskIds, setMitTaskIds] = useState<string[]>([]);
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([]);
  const [maintenanceDecisions, setMaintenanceDecisions] = useState<Record<string, any>>({});
  const [kpiNotes, setKpiNotes] = useState('');
  const [taskBlockAssignments, setTaskBlockAssignments] = useState<Record<string, string>>({});
  const [finalNotes, setFinalNotes] = useState('');

  // Answers map for hydration
  const [answers, setAnswers] = useState<Record<string, ReviewAnswerData>>({});

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
            case 'difficulties':
              setDifficulties((ans.answerData as any)?.text ?? '');
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

        // Resume from last answered step + 1
        const answeredKeys = new Set(answersData.map((a) => a.stepKey));
        let resumeStep = 0;
        for (let i = 0; i < STEPS.length; i++) {
          if (answeredKeys.has(STEPS[i].key)) {
            resumeStep = i + 1;
          } else {
            break;
          }
        }
        setCurrentStep(Math.min(resumeStep, TOTAL_STEPS - 1));
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const persistAnswer = useCallback(async (stepKey: string, answerType: string, answerData: any) => {
    try {
      await fetch(`/api/reviews/${reviewId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepKey, answerType, answerData }),
      });
    } catch {
      // silently fail - will retry on next persist
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
      case 'difficulties':
        await persistAnswer('difficulties', 'text', { text: difficulties });
        break;
      case 'mit':
        await persistAnswer('mit', 'priority_ranking', { taskIds: mitTaskIds });
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
  }, [currentStep, difficulties, mitTaskIds, workBlocks, maintenanceDecisions, kpiNotes, taskBlockAssignments, finalNotes, persistAnswer]);

  const advanceStep = async () => {
    await persistCurrentStep();

    if (currentStep === TOTAL_STEPS - 1) {
      // Complete the review
      try {
        await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: finalNotes, complete: true }),
        });
        setCompleted(true);
      } catch {
        // silently fail
      }
      return;
    }

    setCurrentStep(currentStep + 1);
  };

  const goBack = () => {
    if (currentStep > 0) {
      // Persist before going back too
      persistCurrentStep();
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
              <StepCurrentGoals reviewId={reviewId} />
            )}
            {step.key === 'review_tasks' && (
              <StepReviewTasks reviewId={reviewId} />
            )}
            {step.key === 'difficulties' && (
              <StepDifficulties
                reviewId={reviewId}
                initialText={difficulties}
                onAnswerChange={setDifficulties}
              />
            )}
            {step.key === 'mit' && (
              <StepTop3Tasks
                reviewId={reviewId}
                selectedTaskIds={mitTaskIds}
                onSelectionChange={setMitTaskIds}
              />
            )}
            {step.key === 'work_blocks' && (
              <StepCalendarPlanning
                reviewId={reviewId}
                initialBlocks={workBlocks}
                onBlocksChange={setWorkBlocks}
              />
            )}
            {step.key === 'weekly_goals' && (
              <StepWeeklyGoals reviewId={reviewId} />
            )}
            {step.key === 'maintenance' && (
              <StepMaintenanceReview
                reviewId={reviewId}
                initialDecisions={maintenanceDecisions}
                onDecisionsChange={setMaintenanceDecisions}
              />
            )}
            {step.key === 'kpi_progress' && (
              <StepKpiProgress
                reviewId={reviewId}
                initialNotes={kpiNotes}
                onNotesChange={setKpiNotes}
              />
            )}
            {step.key === 'schedule_tasks' && (
              <StepScheduleTasks
                reviewId={reviewId}
                mitTaskId={mitTaskIds.length > 0 ? mitTaskIds[0] : null}
                workBlocks={workBlocks}
                initialAssignments={taskBlockAssignments}
                onAssignmentsChange={setTaskBlockAssignments}
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
