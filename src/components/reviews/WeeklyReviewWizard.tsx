'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR, { useSWRConfig } from 'swr';
import { useToast } from '@/components/ui/ToastProvider';
import {
  ChevronRight, ChevronLeft, PartyPopper,
  Target, ListTodo, AlertTriangle, Star, Calendar,
  Wrench, BarChart3, FileText, CalendarClock,
} from 'lucide-react';

import { getLocalDateString } from '@/lib/date-utils';
import { ProcessKpiLogStep } from '@/components/shared/ProcessKpiLogStep';
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
// 1. Current Goals → 2. Review Tasks → 3. KPI Progress →
// 3a. [Process KPI Log (conditional)] → 4. Successes & Difficulties → ...
// The process_kpi_log step is inserted dynamically after kpi_progress
// if processes with KPIs are due/scheduled this week.
const STEPS_BASE = [
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
];

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

// Render any saved answerData blob as readable text. Covers the common
// shapes used by the wizard's steps; falls back to pretty JSON.
function formatAnswerForDisplay(data: unknown): string {
  if (data == null) return '—';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.successes) || Array.isArray(d.difficulties)) {
    const parts: string[] = [];
    if (Array.isArray(d.successes) && d.successes.length) {
      parts.push(`Successes:\n${(d.successes as string[]).map((s) => `  • ${s}`).join('\n')}`);
    }
    if (Array.isArray(d.difficulties) && d.difficulties.length) {
      parts.push(`Difficulties:\n${(d.difficulties as string[]).map((s) => `  • ${s}`).join('\n')}`);
    }
    return parts.join('\n\n') || '—';
  }
  if (typeof d.notes === 'string' && d.notes) return d.notes;
  if (typeof d.text === 'string' && d.text) return d.text;
  if (Array.isArray(d.taskIds)) return `${d.taskIds.length} tasks selected`;
  if (Array.isArray(d.blocks)) return `${d.blocks.length} work block(s) planned`;
  if (d.assignments && typeof d.assignments === 'object') {
    return `${Object.keys(d.assignments).length} task(s) assigned to blocks`;
  }
  if (d.decisions && typeof d.decisions === 'object') {
    const decisions = d.decisions as Record<string, string>;
    return Object.entries(decisions).map(([k, v]) => `${k}: ${v}`).join('\n') || '—';
  }
  return JSON.stringify(data, null, 2);
}

export function WeeklyReviewWizard({ reviewId, isTeamReview }: WeeklyReviewWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  // URL step param is 1-based for user-friendliness; internal state is 0-based
  // Processes with KPIs due this week (WEEKLY + BIWEEKLY cadences)
  const [dueKpiProcesses, setDueKpiProcesses] = useState<Array<{ process: any; kpis: any[] }>>([]);

  // Dynamic STEPS — inserts process_kpi_log after kpi_progress when eligible processes exist
  const STEPS = useMemo(() => {
    const kpiStepIdx = STEPS_BASE.findIndex((s) => s.key === 'kpi_progress');
    if (dueKpiProcesses.length === 0 || kpiStepIdx === -1) return STEPS_BASE;
    const result = [...STEPS_BASE];
    result.splice(kpiStepIdx + 1, 0, {
      key: 'process_kpi_log',
      title: 'Process KPI Log',
      icon: BarChart3,
      description: 'Log KPI progress for weekly and biweekly processes due this week.',
    });
    return result;
  }, [dueKpiProcesses]);

  const TOTAL_STEPS = STEPS.length;
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
  const [_mitTaskPoolSize, setMitTaskPoolSize] = useState<number | null>(null);


  // Upcoming week boundaries (Mon-Sun)
  // Uses today's date string as dependency so it recomputes if the component stays mounted across midnight
  const todayKey = new Date().toISOString().split('T')[0];
  const upcomingWeekStart = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const off = dow === 0 ? -6 : 1 - dow;
    const d = new Date(now);
    d.setDate(now.getDate() + off);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayKey]);
  const upcomingWeekEnd = useMemo(() => {
    const d = new Date(upcomingWeekStart);
    d.setDate(upcomingWeekStart.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [upcomingWeekStart]);
  const nextWeekEnd = useMemo(() => {
    const d = new Date(upcomingWeekEnd);
    d.setDate(upcomingWeekEnd.getDate() + 7);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [upcomingWeekEnd]);
  const upcomingWeekStartStr = getLocalDateString(upcomingWeekStart);

  const nextWeekEndStr = getLocalDateString(nextWeekEnd);

  // Fetch the same task pool the calendar should care about here: current week + next week.
  const reviewScopeParam = isTeamReview ? '&scope=company' : '&scope=individual';
  const weekTasksSWRKey = `/api/tasks?startDate=${upcomingWeekStartStr}&endDate=${nextWeekEndStr}&includeUnscheduled=true${reviewScopeParam}`;
  const weekAimsSWRKey = `/api/aims/instances?start=${upcomingWeekStartStr}T00:00:00&end=${nextWeekEndStr}T23:59:59`;
  const { data: weekTasks } = useSWR(weekTasksSWRKey);
  const { data: weekAims } = useSWR(weekAimsSWRKey);

  // Fetch settings for weekly target calendar filtering
  const { data: userSettings } = useSWR('/api/settings');
  const weeklyTargetCalendarIds = useMemo(() => {
    if (!userSettings || !Array.isArray(userSettings.weeklyTargetCalendarIds)) return [];
    return userSettings.weeklyTargetCalendarIds as string[];
  }, [userSettings]);

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
        const dueDateInPlanningWindow = t.dueDate &&
          new Date(t.dueDate) >= upcomingWeekStart &&
          new Date(t.dueDate) <= nextWeekEnd;
        const include =
          (t.goalId && upcomingWeekGoalIds.has(t.goalId)) || // linked to upcoming week goal
          (t.taskType === 'MAINTENANCE' && dueDateInPlanningWindow) || // maintenance due this/next week
          (t.taskType === 'REACT' && dueDateInPlanningWindow) ||       // react tasks due this/next week
          (t.goalId && personalGoalIds.has(t.goalId)) ||     // part of personal goal stack
          dueDateInPlanningWindow ||                         // any task due this/next week
          (!t.goalId && !t.dueDate && t.status === 'TODO');  // unlinked TODO tasks
        if (include) {
          items.push({ id: t.id, itemType: 'task', title: t.title, duration: t.estimatedMinutes || 60, taskType: t.taskType, priority: t.priority });
          // Also surface unscheduled child tasks (subtasks from processes)
          if (Array.isArray(t.children)) {
            for (const child of t.children) {
              if (child.status === 'DONE' || child.status === 'DROPPED') continue;
              if (child.timeBlockStart) continue;
              items.push({
                id: child.id,
                itemType: 'task',
                title: `${t.title} › ${child.title}`,
                duration: child.estimatedMinutes || 30,
                taskType: t.taskType,
                priority: child.priority || t.priority,
              });
            }
          }
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
  }, [weekTasks, weekAims, upcomingWeekGoalIds, personalGoalIds, upcomingWeekStart, nextWeekEnd]);

  useEffect(() => {
    fetchReviewAndAnswers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  useEffect(() => {
    const today = getLocalDateString();
    fetch(`/api/processes/kpis/due?period=weekly&date=${today}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setDueKpiProcesses(Array.isArray(data) ? data : []))
      .catch(() => {}); // non-critical
  }, []);

  const [savedAnswers, setSavedAnswers] = useState<ReviewAnswerData[]>([]);

  const fetchReviewAndAnswers = async () => {
    try {
      // Fetch review
      const reviewRes = await fetch(`/api/reviews/${reviewId}`);
      let alreadyCompleted = false;
      if (reviewRes.ok) {
        const reviewData = await reviewRes.json();
        setReview(reviewData);

        if (reviewData.completedAt) {
          alreadyCompleted = true;
          setCompleted(true);
        }
      }

      // Always fetch existing answers — for completed reviews we render them
      // as a read-only transcript; for in-progress reviews we hydrate state.
      const answersRes = await fetch(`/api/reviews/${reviewId}/answers`);
      if (answersRes.ok) {
        const answersData: ReviewAnswerData[] = await answersRes.json();
        setSavedAnswers(answersData);

        if (alreadyCompleted) {
          setLoading(false);
          return;
        }

        for (const ans of answersData) {
          // Hydrate step state from saved answers
          switch (ans.stepKey) {
            case 'successes_difficulties':
              setSuccesses(ans.answerData?.successes ?? []);
              setDifficulties(ans.answerData?.difficulties ?? []);
              break;
            case 'difficulties':
              // Legacy support
              setDifficulties(typeof ans.answerData?.text === 'string'
                ? [ans.answerData.text]
                : ans.answerData?.difficulties ?? []);
              break;
            // Support both legacy 'top3' key and new 'mit' key
            case 'top3':
            case 'mit':
              setMitTaskIds(ans.answerData?.taskIds ?? []);
              break;
            case 'work_blocks':
              setWorkBlocks(ans.answerData?.blocks ?? []);
              break;
            case 'maintenance':
              setMaintenanceDecisions(ans.answerData?.decisions ?? {});
              break;
            case 'kpi_progress':
              setKpiNotes(ans.answerData?.notes ?? '');
              break;
            case 'schedule_tasks':
              setTaskBlockAssignments(ans.answerData?.assignments ?? {});
              break;
            case 'notes_completion':
              setFinalNotes(ans.answerData?.notes ?? '');
              break;
          }
        }

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

  const handleCreateWorkBlock = useCallback(async (start: Date, end: Date, title = 'Work Block') => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      if (!res.ok) {
        toast.error('Failed to create work block. Is Google Calendar connected?');
        return;
      }

      const created = await res.json().catch(() => null);
      const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
      const preferredTime = start.toISOString().slice(11, 16);
      const normalizedTitle = title || 'Work Block';
      const type: WorkBlock['type'] = normalizedTitle.toLowerCase().includes('aim')
        ? 'aim'
        : normalizedTitle.toLowerCase().includes('deep')
          ? 'deep_work'
          : 'normal';

      setWorkBlocks((current) => {
        const nextBlock: WorkBlock = {
          id: created?.id ?? `work-block-${start.toISOString()}-${end.toISOString()}`,
          name: normalizedTitle,
          type,
          durationMinutes,
          preferredTime,
        };
        if (current.some((block) => block.id === nextBlock.id)) return current;
        return [...current, nextBlock];
      });
    } catch {
      toast.error('Failed to create work block.');
    }
  }, [toast]);

  const handleScheduleItem = useCallback(async (itemId: string, itemType: string, start: Date, end: Date) => {
    const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeBlockStart: start.toISOString(), timeBlockEnd: end.toISOString() }),
    });
    if (!res.ok) throw new Error(`Failed to schedule item: ${res.status}`);
    mutate(weekTasksSWRKey);
    mutate(weekAimsSWRKey);
  }, [mutate, weekTasksSWRKey, weekAimsSWRKey]);

  const handleUnscheduleItem = useCallback(async (itemId: string, itemType: string) => {
    const endpoint = itemType === 'aim' ? `/api/aims/instances/${itemId}` : `/api/tasks/${itemId}`;
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
    });
    mutate(weekTasksSWRKey);
    mutate(weekAimsSWRKey);
  }, [mutate, weekTasksSWRKey, weekAimsSWRKey]);

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
        // Apply Win The Day flags + ranks for the upcoming week's top tasks
        if (mitTaskIds.length > 0) {
          await fetch('/api/tasks/batch-win-the-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds: mitTaskIds }),
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
      case 'mit':
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
        const res = await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: finalNotes, complete: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6"
      >
        <div className="text-center">
          <PartyPopper className="h-14 w-14 text-yellow-400 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Weekly Review Complete</h2>
          <p className="text-sm text-[var(--text-muted)]">Your saved answers are below.</p>
        </div>

        {savedAnswers.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-muted)] py-6">No saved answers on this review.</p>
        ) : (
          <div className="space-y-4">
            {savedAnswers.map((ans) => {
              const stepTitle = STEPS.find((s) => s.key === ans.stepKey)?.title ?? ans.stepKey;
              return (
                <div key={ans.stepKey} className="glass-panel p-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">
                    {stepTitle}
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)] font-sans">
                    {formatAnswerForDisplay(ans.answerData)}
                  </pre>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center pt-2">
          <button
            onClick={() => router.push('/reviews')}
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Back to Reviews
          </button>
        </div>
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
              <StepReviewTasks reviewId={reviewId} isTeamReview={isTeamReview} />
            )}
            {step.key === 'kpi_progress' && (
              <StepKpiProgress
                reviewId={reviewId}
                initialNotes={kpiNotes}
                onNotesChange={setKpiNotes}
                isTeamReview={isTeamReview}
              />
            )}
            {step.key === 'process_kpi_log' && (
              <ProcessKpiLogStep processes={dueKpiProcesses} date={getLocalDateString()} />
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
                onTaskCountChange={setMitTaskPoolSize}
                isTeamReview={isTeamReview}
              />
            )}
            {(step.key === 'work_blocks' || step.key === 'schedule_tasks') && (
              <CalendarStepContent
                isTeamReview={isTeamReview}
                mode={step.key === 'work_blocks' ? 'work_blocks' : 'schedule_tasks'}
                description={
                  step.key === 'work_blocks'
                    ? 'Create Deep Work, Normal Work, and AIM blocks on your weekly calendar.'
                    : 'Drag your tasks and AIMs into the work blocks you created.'
                }
                stepTitle={step.title}
                calendarModalOpen={calendarModalOpen}
                onOpenModal={() => setCalendarModalOpen(true)}
                onCloseModal={() => setCalendarModalOpen(false)}
                dateRange={{ start: `${upcomingWeekStartStr}T00:00:00`, end: `${nextWeekEndStr}T23:59:59` }}
                unscheduledItems={unscheduledForCalendar}
                aimBlockDuration={step.key === 'work_blocks' ? aimBlockDuration : undefined}
                onCreateWorkBlock={step.key === 'work_blocks' ? handleCreateWorkBlock : undefined}
                onSchedule={handleScheduleItem}
                onUnschedule={handleUnscheduleItem}
                onRefresh={() => { mutate(weekTasksSWRKey); mutate(weekAimsSWRKey); }}
                showWorkBlockTemplates={step.key === 'work_blocks'}
                weeklyTargetCalendarIds={weeklyTargetCalendarIds}
              />
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

/* ===== Extracted calendar step to eliminate duplication between work_blocks and schedule_tasks ===== */

interface CalendarStepContentProps {
  isTeamReview?: boolean;
  mode: 'work_blocks' | 'schedule_tasks';
  description: string;
  stepTitle: string;
  calendarModalOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
  dateRange: { start: string; end: string };
  unscheduledItems: any[];
  aimBlockDuration?: number;
  onCreateWorkBlock?: (start: Date, end: Date, title?: string) => Promise<void>;
  onSchedule: (itemId: string, itemType: string, start: Date, end: Date) => Promise<void>;
  onUnschedule: (itemId: string, itemType: string) => Promise<void>;
  onRefresh?: () => void;
  showWorkBlockTemplates?: boolean;
  weeklyTargetCalendarIds?: string[];
}

function CalendarStepContent({
  isTeamReview,
  mode,
  description,
  stepTitle,
  calendarModalOpen,
  onOpenModal,
  onCloseModal,
  dateRange,
  unscheduledItems,
  aimBlockDuration,
  onCreateWorkBlock,
  onSchedule,
  onUnschedule,
  onRefresh,
  showWorkBlockTemplates,
  weeklyTargetCalendarIds,
}: CalendarStepContentProps): ReactNode {
  if (isTeamReview) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">Calendar scheduling is done individually.</p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center py-4">
        <p className="text-sm text-[var(--text-secondary)] mb-4">{description}</p>
        <button
          onClick={onOpenModal}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Open Calendar
        </button>
      </div>
      {calendarModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-start justify-center pt-3">
          <div className="bg-[var(--surface-default,#fff)] dark:bg-[var(--surface-default,#1a1a2e)] rounded-xl w-[98vw] h-[calc(100vh-24px)] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{stepTitle}</h3>
              <button
                onClick={onCloseModal}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="flex-1 min-h-0 p-2">
              <CalendarSplitView
                mode={mode}
                viewMode="week"
                dateRange={dateRange}
                unscheduledItems={unscheduledItems}
                aimBlockDuration={aimBlockDuration}
                onCreateWorkBlock={onCreateWorkBlock}
                onSchedule={onSchedule}
                onUnschedule={onUnschedule}
                onRefresh={onRefresh}
                showWorkBlockTemplates={showWorkBlockTemplates}
                weeklyTargetCalendarIds={weeklyTargetCalendarIds}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
