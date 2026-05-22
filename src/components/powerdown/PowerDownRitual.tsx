'use client';

import { mutate } from 'swr';
import { useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import {
  CheckCircle2, ChevronRight, ChevronLeft, PartyPopper, AlertCircle,
  Heart, Lightbulb, Calendar, X, Circle, Pencil, Star, Flame, Target, Clock, ChevronDown,
} from 'lucide-react';
import { getLocalDateString, getUpcomingWeekBoundaries, getWeekBoundaries, minutesBetween, parseLocalDate } from '@/lib/date-utils';
import { matchPrefix } from '@/lib/swr-helpers';
import { TopNTaskSelector } from '@/components/reviews/shared/TopNTaskSelector';
import { useToast } from '@/components/ui/ToastProvider';
import { ClearGoalGuide } from './ClearGoalGuide';
import { InlineTaskCreator } from '@/components/tasks/InlineTaskCreator';
import { ProcessKpiLogStep } from '@/components/shared/ProcessKpiLogStep';
const CalendarSplitView = dynamic(
  () => import('@/components/calendar/CalendarSplitView').then(m => m.CalendarSplitView),
  { ssr: false, loading: () => <div className="text-[var(--text-muted)] py-4 text-center">Loading calendar...</div> }
);
import {
  WorkBlockObjectiveModal,
  type WorkBlockObjectiveInput,
  type WorkBlockObjectivePayload,
  type WorkBlockNameRequest,
  type WorkBlockNameResolved,
} from '@/components/calendar/WorkBlockObjectiveModal';
import { fetchTaskWorkBlockHints, patchWorkBlock, deleteWorkBlock } from '@/lib/work-blocks-client';
import { PRISM_COLORS } from '@/lib/prism-colors';
import { ScheduledItemGoals } from '@/components/scheduled-item-goals/ScheduledItemGoals';
import { CompletionReviewRow } from '@/components/shared/CompletionReviewRow';

// Power Down steps — reordered per Prism overhaul spec (2026-03-28)
// 1. Review Today → 2. [Log Process KPIs (conditional)] → 2/3. Weekly Goals & Tasks → ...
// Step 2 is conditionally inserted if processes with KPIs are due today.
// When inserted, all following steps shift up by 1.
// STEPS are computed dynamically inside the component via useMemo.

interface DistractionEntry {
  content: string;
  notes: string;
}

interface ListCaptureStepProps {
  items: string[];
  setItems: (items: string[]) => void;
  icon: ReactNode;
  placeholder: string;
  emptyText?: string;
  prompt: string;
  color: string;
  children?: ReactNode;
}

function ListCaptureStep({ items, setItems, icon, placeholder, emptyText, prompt, children }: ListCaptureStepProps) {
  const [inputValue, setInputValue] = useState('');

  const addItem = () => {
    if (inputValue.trim()) {
      setItems([...items, inputValue.trim()]);
      setInputValue('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm text-[var(--text-secondary)]">{prompt}</p>
      </div>
      {children}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addItem();
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={addItem}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
        >
          Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--surface-raised)]/50 px-3 py-2">
          <span className="text-sm text-[var(--text-primary)]">{item}</span>
          <button
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            className="text-[var(--text-muted)] hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {emptyText && items.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">{emptyText}</p>
      )}
    </div>
  );
}

interface InlineTaskEditProps {
  editTitle: string;
  editDescription: string;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  size?: 'sm' | 'md';
}

function InlineTaskEdit({
  editTitle, editDescription, onTitleChange, onDescriptionChange, onSave, onCancel, size = 'md',
}: InlineTaskEditProps) {
  const inputClass = size === 'sm'
    ? 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none'
    : 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';
  const btnPadding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1';

  return (
    <div className={size === 'sm' ? 'space-y-1' : 'space-y-2'}>
      <input type="text" value={editTitle} onChange={(e) => onTitleChange(e.target.value)} placeholder="Task title" className={inputClass} />
      <input type="text" value={editDescription} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="Description (optional)" className={inputClass} />
      <div className="flex gap-2">
        <button onClick={onSave} className={`text-xs rounded bg-indigo-600 ${btnPadding} text-white hover:bg-indigo-500`}>Save</button>
        <button onClick={onCancel} className={`text-xs rounded bg-[var(--surface)] ${btnPadding} text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]`}>Cancel</button>
      </div>
    </div>
  );
}

interface PowerDownRitualProps {
  onComplete: () => void;
  /**
   * Anchor date for this session (YYYY-MM-DD). Defaults to today. Pass a
   * past date to open a historical powerdown read-only-ish (every fetch +
   * label routes through this date).
   */
  date?: string;
}

export function PowerDownRitual({ onComplete, date }: PowerDownRitualProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const toast = useToast();
  const previousThemeRef = useRef<string | undefined>();
  // Capture once at mount so cross-midnight drift can't shift the session.
  // Defaults to today when no `date` prop is provided.
  const [sessionDate] = useState(() => date || getLocalDateString());
  const [sessionTomorrow] = useState(() => {
    const d = parseLocalDate(sessionDate);
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  });
  const tomorrowDateRange = useMemo(() => {
    const start = parseLocalDate(sessionTomorrow);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [sessionTomorrow]);
  const [session, setSession] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<any[]>([]);
  const [tomorrowPlan, setTomorrowPlan] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [powerdownStreak, setPowerdownStreak] = useState<number>(0);

  const [distractions, setDistractions] = useState<DistractionEntry[]>([]);
  const [distractionContent, setDistractionContent] = useState('');
  const [distractionNotes, setDistractionNotes] = useState('');
  const [gratitudes, setGratitudes] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  // Clear Goals — mirrors the ClearGoal DB rows for each visible task, keyed
  // by taskId. This IS the source of truth during the ritual: add → POST,
  // remove → DELETE, initial load → GET per visible task.
  const [goalChecklistsByTask, setGoalChecklistsByTask] = useState<Record<string, Array<{ id: string; text: string; isComplete: boolean; sortOrder: number }>>>({});
  const [calendarReviewed, setCalendarReviewed] = useState(false);
  const [saving, setSaving] = useState(false);

  // AIM instances for Review Today step
  const [aimInstances, setAimInstances] = useState<any[]>([]);

  // Weekly goals for Weekly Goals & Tasks step
  const [weeklyGoals, setWeeklyGoals] = useState<any[]>([]);
  const [weeklyGoalsLoading, setWeeklyGoalsLoading] = useState(false);
  // REACT + MAINTENANCE tasks for the upcoming Mon–Sun. Sourced once Step 2
  // is reached (lazy fetch in useEffect below). Most lack a goalId, so they
  // render as flat-by-taskType under the weekly-goals view.
  const [upcomingReactMaintTasks, setUpcomingReactMaintTasks] = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [newTaskExpanded, setNewTaskExpanded] = useState<Record<string, boolean>>({});
  const [newTaskDescription, setNewTaskDescription] = useState<Record<string, string>>({});
  const [newTaskDueDate, setNewTaskDueDate] = useState<Record<string, string>>({});
  const [newTaskDuration, setNewTaskDuration] = useState<Record<string, number>>({});

  // Memoize current week end for task creation defaults
  const weekEnd = useMemo(() => getWeekBoundaries().end, []);

  // Calendar modal state
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  const [unscheduledTomorrowItems, setUnscheduledTomorrowItems] = useState<any[]>([]);

  // Reschedule step state
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState<Record<string, boolean>>({});
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Clear Goals step state — goalChecklistsByTask (above) holds the DB rows
  // for the read-only Goal Clarity Summary fallback (when a work block has no
  // per-block goals yet). The Clear Goals step itself is now driven by the
  // ScheduledItemGoals component, which manages its own input state.
  const [clearGoalGuideOpen, setClearGoalGuideOpen] = useState(false);
  // Tracks which task ids have already been fetched so we don't refetch on
  // every parent rerender. Reset on unmount via the component lifecycle.
  const fetchedClearGoalTaskIdsRef = useRef<Set<string>>(new Set());

  // AIM block duration for Deep Work template (mirrors WeeklyReviewWizard logic)
  const [aimBlockDuration, setAimBlockDuration] = useState(60);
  // Calendar IDs that count toward weekly target
  const [weeklyTargetCalendarIds, setWeeklyTargetCalendarIds] = useState<string[]>([]);
  // Minutes; null = no target = Step 4 header hidden.
  const [dailyHoursTargetMinutes, setDailyHoursTargetMinutes] = useState<number | null>(null);

  // KPI processes due today (conditional step)
  const [dueKpiProcesses, setDueKpiProcesses] = useState<Array<{ process: any; kpis: any[] }>>([]);

  // Today's work blocks — powered by WorkBlock feature. Reviewed in the Review Work Blocks step.
  interface PowerdownWorkBlock {
    id: string;
    start: string;
    end: string;
    mainObjective: string;
    completionStatus: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';
    actualMinutes: number | null;
    notes: string | null;
    task: { id: string; title: string; status: string; taskType: string; priority?: string; estimatedMinutes: number; dueDate: string | null };
    clearGoals: Array<{ id: string; text: string; isComplete: boolean; sortOrder: number }>;
  }
  interface PowerdownAimInstance {
    id: string;
    scheduledDate: string;
    timeBlockStart: string | null;
    timeBlockEnd: string | null;
    status: string;
    activityNote: string | null;
    selectedActivity: string | null;
    actualMinutes: number | null;
    aimCategory: { id: string; name: string; defaultDurationMin?: number };
  }
  const [todayWorkBlocks, setTodayWorkBlocks] = useState<PowerdownWorkBlock[]>([]);
  const [tomorrowWorkBlocks, setTomorrowWorkBlocks] = useState<PowerdownWorkBlock[]>([]);
  const [tomorrowAimInstances, setTomorrowAimInstances] = useState<PowerdownAimInstance[]>([]);
  const [blockReviewPicks, setBlockReviewPicks] = useState<Record<string, 'COMPLETED' | 'PARTIAL' | 'MISSED'>>({});
  const [blockReviewNotes, setBlockReviewNotes] = useState<Record<string, string>>({});
  const [blockReviewActual, setBlockReviewActual] = useState<Record<string, number>>({});
  // AIM instance completion picks for the review_blocks step (keyed by aim instance id)
  const [aimReviewPicks, setAimReviewPicks] = useState<Record<string, 'COMPLETED' | 'SKIPPED' | 'MISSED'>>({});
  const [aimReviewActual, setAimReviewActual] = useState<Record<string, number>>({});
  const [taskExtendOpen, setTaskExtendOpen] = useState<Record<string, boolean>>({});
  const [taskExtendEstimate, setTaskExtendEstimate] = useState<Record<string, number>>({});
  const [taskExtendDueDate, setTaskExtendDueDate] = useState<Record<string, string>>({});
  const [taskExtendSaving, setTaskExtendSaving] = useState<Record<string, boolean>>({});

  const saveTaskExtend = async (taskId: string) => {
    const estimated = taskExtendEstimate[taskId];
    const dueDate = taskExtendDueDate[taskId];
    const body: Record<string, unknown> = {};
    if (typeof estimated === 'number' && estimated > 0) body.estimatedMinutes = estimated;
    if (dueDate) body.dueDate = dueDate;
    if (Object.keys(body).length === 0) return;
    setTaskExtendSaving((p) => ({ ...p, [taskId]: true }));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTodayWorkBlocks((prev) => prev.map((b) =>
          b.task.id === taskId
            ? { ...b, task: { ...b.task, estimatedMinutes: (body.estimatedMinutes as number) ?? b.task.estimatedMinutes, dueDate: (body.dueDate as string) ?? b.task.dueDate } }
            : b,
        ));
        setTaskExtendOpen((p) => ({ ...p, [taskId]: false }));
      }
    } finally {
      setTaskExtendSaving((p) => ({ ...p, [taskId]: false }));
    }
  };

  const fetchTomorrowWorkBlocks = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-blocks?date=${sessionTomorrow}`);
      if (res.ok) {
        const blocks: PowerdownWorkBlock[] = await res.json();
        setTomorrowWorkBlocks(blocks);
      }
    } catch {
      // non-critical
    }
  }, [sessionTomorrow]);

  const fetchTomorrowAimInstances = useCallback(async () => {
    try {
      const start = parseLocalDate(sessionTomorrow);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(end.getMilliseconds() - 1);
      const res = await fetch(`/api/aims/instances?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      if (res.ok) setTomorrowAimInstances(await res.json());
    } catch {
      // non-critical
    }
  }, [sessionTomorrow]);

  const fetchTodayWorkBlocks = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-blocks?date=${sessionDate}`);
      if (res.ok) {
        const blocks: PowerdownWorkBlock[] = await res.json();
        setTodayWorkBlocks(blocks);
        const picks: Record<string, 'COMPLETED' | 'PARTIAL' | 'MISSED'> = {};
        const notes: Record<string, string> = {};
        const actual: Record<string, number> = {};
        blocks.forEach((b) => {
          if (b.completionStatus === 'COMPLETED' || b.completionStatus === 'PARTIAL' || b.completionStatus === 'MISSED') {
            picks[b.id] = b.completionStatus;
          }
          notes[b.id] = b.notes ?? '';
          const scheduled = Math.max(0, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000));
          actual[b.id] = b.actualMinutes ?? scheduled;
        });
        setBlockReviewPicks(picks);
        setBlockReviewNotes(notes);
        setBlockReviewActual(actual);
      }
    } catch {
      // non-critical
    }
  }, [sessionDate]);

  const toggleBlockClearGoal = async (goalId: string, isComplete: boolean) => {
    // optimistic
    setTodayWorkBlocks((prev) =>
      prev.map((b) => ({
        ...b,
        clearGoals: b.clearGoals.map((g) => (g.id === goalId ? { ...g, isComplete: !isComplete } : g)),
      }))
    );
    try {
      // Resolve taskId from the block containing this goal
      let taskId: string | undefined;
      for (const b of todayWorkBlocks) {
        if (b.clearGoals.some((g) => g.id === goalId)) {
          taskId = b.task.id;
          break;
        }
      }
      if (!taskId) return;
      await fetch(`/api/tasks/${taskId}/clear-goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: [{ id: goalId, isComplete: !isComplete }] }),
      });
    } catch {
      fetchTodayWorkBlocks();
    }
  };

  const [timerSeconds, setTimerSeconds] = useState(300);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const id = setInterval(() => setTimerSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerSeconds]);

  // Auto-switch to dark mode during Power Down (evening ritual)
  useEffect(() => {
    if (resolvedTheme !== 'dark') {
      previousThemeRef.current = resolvedTheme;
      setTheme('dark');
    }
    return () => {
      // Restore previous theme when leaving Power Down
      if (previousThemeRef.current && previousThemeRef.current !== 'dark') {
        setTheme(previousThemeRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate goalChecklistsByTask from the ClearGoal table for every task that
  // can appear in the Clear Goals / Goal Summary steps. Runs whenever the
  // visible task pool grows; the ref guard prevents redundant refetches.
  useEffect(() => {
    const idSet = new Set<string>();
    for (const id of tomorrowPlan) idSet.add(id);
    for (const t of tomorrowTasks) idSet.add(t.id);
    const idsToFetch = Array.from(idSet).filter((id) => !fetchedClearGoalTaskIdsRef.current.has(id));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((id) => fetchedClearGoalTaskIdsRef.current.add(id));
    let cancelled = false;
    void Promise.all(
      idsToFetch.map(async (id) => {
        try {
          const res = await fetch(`/api/tasks/${id}/clear-goals`);
          if (!res.ok) return null;
          const goals = await res.json();
          return [id, goals] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setGoalChecklistsByTask((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (!entry) continue;
          const [id, goals] = entry;
          next[id] = Array.isArray(goals) ? goals : [];
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [tomorrowPlan, tomorrowTasks]);

  useEffect(() => {
    initSession();
    fetchTodayTasks();
    fetchTomorrowTasks();
    fetchPowerdownStreak();
    fetchUnscheduledTomorrow();
    fetchAimInstances();
    fetchWeeklyGoals();
    fetchUpcomingReactMaintTasks();
    fetchDueKpiProcesses();
    fetchTodayWorkBlocks();
    fetchTomorrowWorkBlocks();
    fetchTomorrowAimInstances();
    // Fetch user aims to compute Deep Work block duration
    fetch('/api/aims/user').then(r => r.ok ? r.json() : []).then((userAims: any[]) => {
      if (!Array.isArray(userAims)) return;
      const activeAims = userAims.filter((ua: any) => ua.isActive && ua.aimCategory);
      if (activeAims.length === 0) return;
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
      setAimBlockDuration(Math.min(...durations));
    }).catch(() => {});
    // Fetch settings for weekly target calendar IDs + daily hours target
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then((settings: any) => {
      if (settings && Array.isArray(settings.weeklyTargetCalendarIds)) {
        setWeeklyTargetCalendarIds(settings.weeklyTargetCalendarIds);
      }
      if (settings && typeof settings.dailyHoursTarget === 'number') {
        setDailyHoursTargetMinutes(settings.dailyHoursTarget);
      }
    }).catch(() => {});
  }, []);

  // Date-anchored URL so historical views (?date=YYYY-MM-DD) hit the
  // right row and SWR cache keys stay consistent with mutate() calls.
  const powerdownGetUrl = `/api/powerdown?date=${sessionDate}`;

  const initSession = async () => {
    // Try to resume existing session
    let res = await fetch(powerdownGetUrl);
    let data = res.ok ? await res.json() : null;

    // Only auto-create a session for today — historical views are read-only-ish
    // (no session is created retroactively if none was completed back then).
    if (!data && !date) {
      res = await fetch('/api/powerdown', { method: 'POST' });
      data = await res.json();
    }

    if (!data) {
      // Historical date with no session — leave session null; the empty
      // state branch below renders from `!session && date`.
      setLoading(false);
      return;
    }

    setSession(data);
    setCurrentStep(data.currentStep ?? 1);
    setCompleted(!!data.completedAt);
    setTomorrowPlan(data.tomorrowPlan ?? []);
    // Restore distractions — handle both old string[] format and new DistractionEntry[] format
    const rawDistractions = data.distractions ?? [];
    if (rawDistractions.length > 0 && typeof rawDistractions[0] === 'string') {
      setDistractions(rawDistractions.map((d: string) => ({ content: d, notes: '' })));
    } else {
      setDistractions(rawDistractions);
    }
    setGratitudes(data.gratitudes ?? []);
    setIdeas(data.ideas ?? []);
    setLoading(false);
  };

  const fetchTodayTasks = async () => {
    const todayStart = parseLocalDate(sessionDate);
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const ninetyDaysAgo = new Date(todayStart);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [todayRes, overdueRes] = await Promise.all([
      fetch(`/api/tasks?date=${sessionDate}`),
      fetch(
        `/api/tasks?startDate=${getLocalDateString(ninetyDaysAgo)}&endDate=${getLocalDateString(yesterday)}` +
          `&includeUpcoming=true`
      ),
    ]);

    const today = todayRes.ok ? await todayRes.json() : [];
    const overdueRaw = overdueRes.ok ? await overdueRes.json() : [];
    const todayIds = new Set<string>(today.map((t: any) => t.id));
    const overdue = overdueRaw.filter(
      (t: any) =>
        t.status !== 'DONE' &&
        t.status !== 'DROPPED' &&
        !t.timeBlockStart &&
        !todayIds.has(t.id),
    );

    setTodayTasks(today);
    setOverdueTasks(overdue);
  };

  const fetchTomorrowTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?date=${sessionTomorrow}`);
    if (res.ok) setTomorrowTasks(await res.json());
  }, [sessionTomorrow]);

  const fetchPowerdownStreak = async () => {
    try {
      const res = await fetch('/api/streaks');
      if (res.ok) {
        const streaks = await res.json();
        const pd = streaks.find((s: any) => s.streakType === 'powerdown');
        if (pd) setPowerdownStreak(pd.currentCount);
      }
    } catch {
      // Streak display is non-critical
    }
  };

  const fetchUnscheduledTomorrow = useCallback(async () => {
    try {
      const todayStart = parseLocalDate(sessionDate);
      const yesterday = new Date(todayStart);
      yesterday.setDate(yesterday.getDate() - 1);
      const ninetyDaysAgo = new Date(todayStart);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const tomorrow = parseLocalDate(sessionTomorrow);
      const twoWeeksOut = new Date(tomorrow);
      twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

      const [unscheduledRes, overdueRes, aimRes] = await Promise.all([
        fetch(
          `/api/tasks?status=TODO&startDate=${getLocalDateString(tomorrow)}` +
            `&endDate=${getLocalDateString(twoWeeksOut)}` +
            `&includeUnscheduled=true`,
        ),
        fetch(
          `/api/tasks?startDate=${getLocalDateString(ninetyDaysAgo)}&endDate=${getLocalDateString(yesterday)}` +
            `&includeUpcoming=true`,
        ),
        fetch('/api/aims/unscheduled'),
      ]);

      const allTasks = unscheduledRes.ok ? await unscheduledRes.json() : [];
      const overdueRaw = overdueRes.ok ? await overdueRes.json() : [];
      const aims = aimRes.ok ? await aimRes.json() : [];

      const unscheduled = allTasks.filter(
        (t: any) =>
          !t.timeBlockStart && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
      );
      const overdue = overdueRaw.filter(
        (t: any) =>
          t.status !== 'DONE' && t.status !== 'DROPPED' && !t.timeBlockStart
      );

      const byId = new Map<string, any>();
      for (const t of overdue) byId.set(t.id, t);
      for (const t of unscheduled) byId.set(t.id, t);

      const taskItems = Array.from(byId.values()).map((t: any) => ({
        id: t.id,
        itemType: 'task' as const,
        title: t.title,
        duration: t.estimatedMinutes ?? 60,
        taskType: t.taskType,
        priority: t.priority,
      }));

      const aimItems = aims.map((a: any) => ({
        id: a.id,
        itemType: 'aim' as const,
        title: a.title,
        duration: a.duration ?? 60,
        aimCategoryId: a.aimCategoryId,
        aimInstanceId: a.aimInstanceId,
        remaining: a.remaining,
      }));

      setUnscheduledTomorrowItems([...taskItems, ...aimItems]);
    } catch {
      // Non-critical
    }
  }, [sessionDate, sessionTomorrow]);

  const fetchAimInstances = useCallback(async () => {
    // Route requires start+end (see src/app/api/aims/instances/route.ts:17).
    // Pass today's full-day window so all of today's instances come back.
    try {
      // Build the window from local midnight today to local midnight tomorrow.
      // Using `+ 86400000ms` would shift by 24h of absolute time, which silently
      // breaks across DST boundaries (spring forward leaks 1h; fall back loses 1h).
      // Date.setDate advances the calendar in local time and is DST-safe.
      const start = parseLocalDate(sessionDate);
      const next = new Date(start);
      next.setDate(next.getDate() + 1);
      const startISO = start.toISOString();
      const endISO = new Date(next.getTime() - 1).toISOString();
      const res = await fetch(`/api/aims/instances?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
      if (res.ok) {
        const instances: PowerdownAimInstance[] = await res.json();
        setAimInstances(instances);
        // Pre-populate review picks from persisted AIM status
        const picks: Record<string, 'COMPLETED' | 'SKIPPED' | 'MISSED'> = {};
        const actual: Record<string, number> = {};
        instances.forEach((a) => {
          if (a.status === 'COMPLETED' || a.status === 'SKIPPED' || a.status === 'MISSED') {
            picks[a.id] = a.status as 'COMPLETED' | 'SKIPPED' | 'MISSED';
          }
          if (a.actualMinutes != null) {
            actual[a.id] = a.actualMinutes;
          }
        });
        setAimReviewPicks(picks);
        setAimReviewActual(actual);
      }
    } catch {
      // Non-critical
    }
  }, [sessionDate]);

  const fetchWeeklyGoals = useCallback(async () => {
    setWeeklyGoalsLoading(true);
    try {
      // Fetch personal AND company weekly goals in parallel. The /api/goals
      // endpoint scopes to personal by default; company goals belong to a
      // separate set of stacks (isCompany=true) that every user in the org
      // should see during Power Down.
      const [personalRes, companyRes] = await Promise.all([
        fetch('/api/goals?level=WEEKLY'),
        fetch('/api/goals?level=WEEKLY&isCompany=true'),
      ]);
      const personal = personalRes.ok ? await personalRes.json() : [];
      const company = companyRes.ok ? await companyRes.json() : [];
      const merged = [
        ...(Array.isArray(personal) ? personal : []),
        ...(Array.isArray(company) ? company : []),
      ];
      const seen = new Set<string>();
      const dedup = merged.filter((g: any) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
      // Exclude completed/abandoned goals
      const goals = dedup.filter((g: any) => g.status !== 'COMPLETED' && g.status !== 'ABANDONED');
      // Filter to goals overlapping the current week (Mon-Sun)
      const { start: weekStart, end: weekEnd } = getWeekBoundaries();
      const currentWeekGoals = goals.filter((g: any) => {
        if (!g.startDate && !g.endDate) return true;
        const gStart = g.startDate ? g.startDate.slice(0, 10) : '0000-01-01';
        const gEnd = g.endDate ? g.endDate.slice(0, 10) : '9999-12-31';
        return gStart <= weekEnd && gEnd >= weekStart;
      });
      // Fetch child tasks for each goal
      const goalsWithTasks = await Promise.all(
        currentWeekGoals.map(async (g: any) => {
          try {
            const taskRes = await fetch(`/api/tasks?goalId=${g.id}`);
            const tasks = taskRes.ok ? await taskRes.json() : [];
            return { ...g, tasks };
          } catch {
            return { ...g, tasks: [] };
          }
        }),
      );
      setWeeklyGoals(goalsWithTasks);
    } catch {
      // Non-critical
    } finally {
      setWeeklyGoalsLoading(false);
    }
  }, []);

  const fetchUpcomingReactMaintTasks = useCallback(async () => {
    try {
      const { start, end } = getUpcomingWeekBoundaries();
      // /api/tasks accepts a single taskType param; React + Maintenance need
      // two calls and a merge. Each is light-weight (no joins) so the round-
      // trip cost is acceptable at this step's frequency (once per powerdown).
      const [reactRes, maintRes] = await Promise.all([
        fetch(`/api/tasks?startDate=${start}&endDate=${end}&taskType=REACT`),
        fetch(`/api/tasks?startDate=${start}&endDate=${end}&taskType=MAINTENANCE`),
      ]);
      const reactTasks = reactRes.ok ? await reactRes.json() : [];
      const maintTasks = maintRes.ok ? await maintRes.json() : [];
      const merged = [
        ...(Array.isArray(reactTasks) ? reactTasks : []),
        ...(Array.isArray(maintTasks) ? maintTasks : []),
      ].filter((t: any) => t.status !== 'DONE' && t.status !== 'DROPPED');
      setUpcomingReactMaintTasks(merged);
    } catch {
      // Non-critical — Step 2 still shows the weekly-goals view
    }
  }, []);

  const fetchDueKpiProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/processes/kpis/due?period=daily&date=${sessionDate}`);
      if (res.ok) {
        const processes = await res.json();
        setDueKpiProcesses(Array.isArray(processes) ? processes : []);
      }
    } catch {
      // Non-critical
    }
  }, [sessionDate]);

  // Dynamic STEPS array — inserts KPI logging step if processes with KPIs are due today
  // currentStep is 1-based and indexes into this array (1 = first step, 2 = second, etc.)
  const STEPS = useMemo(() => {
    const list = [
      { key: 'review_today', title: 'Review Today', description: 'Review today\'s completions and wins.' },
      ...(todayWorkBlocks.length > 0 || aimInstances.length > 0
        ? [{ key: 'review_blocks', title: 'Review Work Blocks & AIMs', description: 'Mark each of today\'s work blocks and AIM sessions as completed, partial/skipped, or missed.' }]
        : []),
      ...(dueKpiProcesses.length > 0
        ? [{ key: 'log_kpis', title: 'Log Process KPIs', description: 'Log KPI progress for processes scheduled today.' }]
        : []),
      { key: 'weekly_goals', title: 'Weekly Goals & Tasks', description: 'See your weekly goals with tasks. Update, create, and review incomplete tasks.' },
      { key: 'top3', title: 'Select Top 3 for Tomorrow', description: 'Pick your top 3 most important tasks for tomorrow, ranked 1st, 2nd, 3rd.' },
      { key: 'calendar', title: "Tomorrow's Calendar", description: 'Drag tasks into tomorrow\'s time blocks. Fully editable — move, resize, or cancel blocks.' },
      { key: 'clear_goals', title: 'Clear Goals', description: 'Create a clear goal checklist for each task scheduled tomorrow, starting with your top 3.' },
      { key: 'lubricate', title: 'Lubricate Tomorrow', description: 'Pre-stage your top 3 — open the doc, type the title, set up the file. Make starting frictionless.' },
      { key: 'goal_summary', title: 'Goal Clarity Summary', description: 'Final checklist of tomorrow\'s tasks with clear goals. Review and edit.' },
      { key: 'ideas', title: 'Capture Ideas', description: 'Dump any ideas — they\'ll be auto-saved to your Ideas list.' },
      { key: 'distractions', title: 'Record Distractions', description: 'What pulled you off track today? Log it so you can guard against it.' },
      { key: 'gratitude', title: 'Daily Gratitude', description: 'Spend a few minutes reflecting on what you\'re grateful for.' },
    ];
    return list.map((s, i) => ({ ...s, num: i + 1 }));
  }, [dueKpiProcesses, todayWorkBlocks.length, aimInstances.length]);

  // Get current step key for rendering
  const currentStepKey = STEPS[currentStep - 1]?.key || 'review_today';

  const toggleAimInstance = async (instance: any) => {
    // The AimInstance row exposes `status`, not `completed`; the Zod schema at
    // updateAimInstanceSchema only accepts { status }, so sending { completed }
    // was silently stripped and the server never updated the row or fired the
    // aim/daily streaks.
    const newStatus = instance.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED';
    try {
      const res = await fetch(`/api/aims/instances/${instance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        toast.error('Failed to update aim.');
        return;
      }
      fetchAimInstances();
    } catch {
      toast.error('Failed to update aim.');
    }
  };

  const createTaskForGoal = async (goalId: string) => {
    const title = (newTaskTitle[goalId] ?? '').trim();
    if (!title) return;
    try {
      const dueDate = newTaskDueDate[goalId] || weekEnd;
      const description = (newTaskDescription[goalId] ?? '').trim() || undefined;
      const estimatedMinutes = newTaskDuration[goalId] || undefined;
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, goalId, dueDate, status: 'TODO', taskType: 'IMPROVE',
          ...(description && { description }),
          ...(estimatedMinutes && { estimatedMinutes }),
        }),
      });
      setNewTaskTitle((prev) => ({ ...prev, [goalId]: '' }));
      setNewTaskDescription((prev) => ({ ...prev, [goalId]: '' }));
      setNewTaskDueDate((prev) => ({ ...prev, [goalId]: '' }));
      setNewTaskDuration((prev) => ({ ...prev, [goalId]: 0 }));
      setNewTaskExpanded((prev) => ({ ...prev, [goalId]: false }));
      fetchWeeklyGoals();
      fetchTomorrowTasks();
    } catch {
      // Non-critical
    }
  };

  // Refresh both sidebar and tomorrow-tasks lists after any schedule/unschedule.
  // CalendarSplitView calls this as onRefresh after the backend PATCH succeeds.
  // Returns a promise so callers can await the fan-out and avoid race
  // conditions with optimistic-UI commits.
  const refreshTomorrowLists = useCallback(async () => {
    await Promise.all([
      fetchUnscheduledTomorrow(),
      fetchTomorrowTasks(),
      fetchTomorrowWorkBlocks(),
      fetchTomorrowAimInstances(),
    ]);
  }, [fetchUnscheduledTomorrow, fetchTomorrowTasks, fetchTomorrowWorkBlocks, fetchTomorrowAimInstances]);

  const handleItemUnscheduled = useCallback(async (itemId: string, itemType: string) => {
    // Each branch checks res.ok and surfaces a toast on failure — without
    // this a failed DELETE/PATCH (auth expired, transient 500) would silently
    // "snap back" because refreshTomorrowLists re-fetches and re-displays the
    // item with no feedback to the user.
    try {
      let res: Response | null = null;
      if (itemType === 'task') {
        res = await fetch(`/api/tasks/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
        });
      } else if (itemType === 'aim') {
        const instanceId = itemId.startsWith('aim-instance-')
          ? itemId.replace('aim-instance-', '') : itemId;
        res = await fetch(`/api/aims/instances/${instanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
        });
      } else if (itemType === 'food') {
        // Food blocks have no "unscheduled" state — unschedule = delete.
        res = await fetch(`/api/food-blocks/${itemId}`, { method: 'DELETE' });
      } else if (itemType === 'workblock') {
        // Workblocks behave like food blocks here: there's no "unscheduled"
        // state for a workblock — dragging it off the calendar deletes it.
        res = await deleteWorkBlock(itemId);
      }
      if (res && !res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
    } catch {
      toast.error('Failed to unschedule.');
    }
    // Await the refresh so any animation/drop completion settles against
    // fresh data (otherwise the optimistic UI commits before fetch finishes).
    await refreshTomorrowLists();
  }, [refreshTomorrowLists, toast]);

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

  // Naming modal wired into step 6. Operates in two modes:
  // - 'drop':  drag created a new workblock → resolve the Promise so CalendarSplitView can POST.
  // - 'edit':  user clicked "reschedule" on an existing workblock → PATCH directly on save.
  const [nameModalInput, setNameModalInput] = useState<WorkBlockObjectiveInput | null>(null);
  const [nameModalMode, setNameModalMode] = useState<'create' | 'edit'>('create');
  const nameModalResolveRef = useRef<((payload: WorkBlockNameResolved | null) => void) | null>(null);
  const editingWorkBlockIdRef = useRef<string | null>(null);

  const clearStaleAwaiter = useCallback(() => {
    if (nameModalResolveRef.current) {
      nameModalResolveRef.current(null);
      nameModalResolveRef.current = null;
    }
    editingWorkBlockIdRef.current = null;
  }, []);

  const openAndAwaitNameModal = useCallback(async (input: WorkBlockNameRequest) => {
    clearStaleAwaiter();
    const hints = await fetchTaskWorkBlockHints(input.taskId);
    return new Promise<WorkBlockNameResolved | null>((resolve) => {
      nameModalResolveRef.current = resolve;
      setNameModalMode('create');
      setNameModalInput({
        ...input,
        taskDeliverable: input.taskDeliverable ?? hints.deliverable,
        taskLevelClearGoals: hints.clearGoals,
      });
    });
  }, [clearStaleAwaiter]);

  // Inline per-workblock actions rendered in step 6. Each mutation ends with
  // fetchTomorrowWorkBlocks so the card list reflects the new state immediately.
  const patchTomorrowWorkBlock = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      try {
        const res = await patchWorkBlock(id, body);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        await fetchTomorrowWorkBlocks();
      } catch {
        toast.error('Failed to update work block.');
      }
    },
    [fetchTomorrowWorkBlocks, toast],
  );

  const deleteTomorrowWorkBlock = useCallback(
    async (id: string) => {
      try {
        const res = await deleteWorkBlock(id);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        await fetchTomorrowWorkBlocks();
      } catch {
        toast.error('Failed to remove work block.');
      }
    },
    [fetchTomorrowWorkBlocks, toast],
  );

  const rescheduleTomorrowWorkBlock = useCallback(
    (block: PowerdownWorkBlock) => {
      clearStaleAwaiter();
      editingWorkBlockIdRef.current = block.id;
      setNameModalMode('edit');
      setNameModalInput({
        taskId: block.task.id,
        taskTitle: block.task.title,
        start: new Date(block.start),
        end: new Date(block.end),
        proposedMinutes: Math.max(
          15,
          Math.round((new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000),
        ),
        initialMainObjective: block.mainObjective,
        initialClearGoals: block.clearGoals.map((g) => g.text),
      });
    },
    [clearStaleAwaiter],
  );

  const handleNameModalSave = useCallback(
    async (payload: WorkBlockObjectivePayload) => {
      const resolved: WorkBlockNameResolved = {
        start: new Date(payload.start),
        end: new Date(payload.end),
        mainObjective: payload.mainObjective,
        clearGoals: payload.clearGoals,
      };
      if (nameModalMode === 'edit' && editingWorkBlockIdRef.current) {
        const blockId = editingWorkBlockIdRef.current;
        editingWorkBlockIdRef.current = null;
        setNameModalInput(null);
        await patchTomorrowWorkBlock(blockId, {
          start: resolved.start.toISOString(),
          end: resolved.end.toISOString(),
          mainObjective: resolved.mainObjective,
          clearGoals: resolved.clearGoals,
        });
        return;
      }
      nameModalResolveRef.current?.(resolved);
      nameModalResolveRef.current = null;
      setNameModalInput(null);
    },
    [nameModalMode, patchTomorrowWorkBlock],
  );

  const handleNameModalCancel = useCallback(() => {
    nameModalResolveRef.current?.(null);
    nameModalResolveRef.current = null;
    editingWorkBlockIdRef.current = null;
    setNameModalInput(null);
  }, []);


  const persistStep = async (
    nextStep: number,
    extra: Record<string, any> = {},
  ): Promise<{ res: Response; data: any } | null> => {
    if (!session) return null;
    const res = await fetch('/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        currentStep: nextStep,
        tomorrowPlan,
        distractions,
        gratitudes,
        ideas,
        ...extra,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
    if (data.streakError) toast.error('Streak update failed — please retry.');
    if (!res.ok) {
      console.error('[powerdown] persistStep failed', { status: res.status, body: data });
    }
    // After a successful completion submission, invalidate any SWR caches
    // that are reading the streak count or this session, so the dashboard
    // updates immediately instead of waiting for a manual refresh.
    if (res.ok && extra.complete) {
      void mutate('/api/streaks');
      void mutate(powerdownGetUrl);
    }
    return { res, data } as const;
  };

  const advanceStep = async () => {
    if (!session || saving) return;
    const next = currentStep + 1;

    if (currentStepKey === 'review_blocks') {
      const workBlockReviews = todayWorkBlocks
        .filter((b) => !!blockReviewPicks[b.id])
        .map((b) => {
          const scheduledMin = minutesBetween(b.start, b.end);
          return {
            workBlockId: b.id,
            completionStatus: blockReviewPicks[b.id],
            actualMinutes: blockReviewActual[b.id] ?? scheduledMin,
            notes: blockReviewNotes[b.id]?.trim() || null,
          };
        });
      if (workBlockReviews.length > 0) {
        try {
          await fetch('/api/work-blocks/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ powerdownSessionId: session.id, reviews: workBlockReviews }),
          });
        } catch {
          toast.error('Failed to save work block reviews');
        }
      }

      // Persist AIM instance completions in parallel
      const aimEntries = Object.entries(aimReviewPicks);
      if (aimEntries.length > 0) {
        const results = await Promise.allSettled(
          aimEntries.map(([aimId, status]) => {
            const body: Record<string, unknown> = { status };
            const actual = aimReviewActual[aimId];
            if (typeof actual === 'number') body.actualMinutes = actual;
            return fetch(`/api/aims/instances/${aimId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          }),
        );
        const failures = results.filter(
          (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
        );
        if (failures.length > 0) {
          toast.error(
            failures.length === aimEntries.length
              ? 'Failed to save AIM reviews'
              : `Saved ${aimEntries.length - failures.length} of ${aimEntries.length} AIM reviews; ${failures.length} failed`,
          );
        }
        // Parameterised SWR keys — predicate form.
        void mutate(matchPrefix('/api/aims/instances'));
      }
    }

    // Fire-and-forget the DistractionLog writes so the user doesn't wait
    // on N round-trips when leaving the distractions step.
    if (currentStepKey === 'distractions' && distractions.length > 0) {
      for (const d of distractions) {
        void fetch('/api/distractions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: d.content,
            notes: d.notes || null,
            logDate: sessionDate,
            source: 'powerdown',
          }),
        }).catch(() => {
          // Non-critical — session JSON still has the data
        });
      }
    }

    if (next > STEPS.length) {
      // Completing the session is the only path we keep awaited so the user
      // sees the celebration only on a confirmed success. res.ok is checked
      // here because prior regressions (tomorrowPlan schema) 400'd silently
      // and the user saw false celebration while the streak never updated.
      setSaving(true);
      try {
        const completeRes = await persistStep(currentStep, { complete: true });
        if (!completeRes || !completeRes.res.ok) {
          toast.error('Failed to complete powerdown — please try again.');
          return;
        }
        // The route returns 200 with `streakError` set when the completedAt
        // write succeeded but the streak update failed. Don't show the
        // celebration screen in that case — keep the user on the final
        // step so a retry tap re-fires the (idempotent) streak update.
        if (completeRes.data?.streakError) {
          return;
        }
        if (tomorrowPlan.length > 0) {
          void fetch('/api/tasks/batch-win-the-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds: tomorrowPlan, dueDate: sessionTomorrow }),
          }).catch((err) => console.error('[powerdown] Failed to apply WTD flags:', err));
        }
        for (const idea of ideas) {
          if (!idea.trim()) continue;
          void fetch('/api/ideas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: idea.trim(),
              description: idea.trim(),
              confidenceScore: 0,
              easeScore: 0,
              impactScore: 0,
            }),
          }).catch((err) => console.error('Failed to save idea:', err));
        }
        setCompleted(true);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Optimistic navigation — persist in the background so Next feels
    // instant. Same pattern used by the weekly review wizard.
    void persistStep(next).catch((err) => console.warn('[powerdown] step persist failed:', err));
    setCurrentStep(next);
  };

  const goBack = () => {
    if (currentStep <= 1) return;
    const prev = currentStep - 1;
    void persistStep(prev).catch((err) => console.warn('[powerdown] step persist failed:', err));
    setCurrentStep(prev);
  };

  const toggleTaskStatus = async (task: any, ...refetchFns: (() => void)[]) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    for (const refetch of refetchFns) refetch();
  };

  const rescheduleTask = async (taskId: string, date: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: date }),
    });
    setShowDatePicker((prev) => ({ ...prev, [taskId]: false }));
    fetchTodayTasks();
    fetchTomorrowTasks();
  };

  const saveTaskEdit = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDescription }),
    });
    setEditingTask(null);
    setEditTitle('');
    setEditDescription('');
    fetchTodayTasks();
    fetchWeeklyGoals();
  };

  const addDistraction = () => {
    if (!distractionContent.trim()) return;
    setDistractions([...distractions, { content: distractionContent.trim(), notes: distractionNotes.trim() }]);
    setDistractionContent('');
    setDistractionNotes('');
  };

  const removeDistraction = (index: number) => {
    setDistractions(distractions.filter((_, i) => i !== index));
  };

  // Step 4 "X / Y hours" progress — sum of scheduled minutes across
  // tomorrow's work blocks (block duration, not task estimate, so partial
  // drags are counted) against the user's daily target. Hoisted ABOVE the
  // early returns below so the hook count stays stable across renders.
  const tomorrowHoursProgress = useMemo(() => {
    const scheduledMinutes = tomorrowWorkBlocks.reduce((acc, b) => {
      const ms = new Date(b.end).getTime() - new Date(b.start).getTime();
      return acc + Math.max(0, Math.round(ms / 60000));
    }, 0);
    const hasTarget = typeof dailyHoursTargetMinutes === 'number' && dailyHoursTargetMinutes > 0;
    const formatHours = (mins: number) => (mins / 60).toFixed(1).replace(/\.0$/, '');
    return {
      hasTarget,
      scheduledMinutes,
      scheduledHours: formatHours(scheduledMinutes),
      targetHours: hasTarget ? formatHours(dailyHoursTargetMinutes!) : null,
      hit: hasTarget && scheduledMinutes >= dailyHoursTargetMinutes!,
    };
  }, [tomorrowWorkBlocks, dailyHoursTargetMinutes]);

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;

  if (!session && date) {
    return (
      <div className="glass-panel p-8 text-center space-y-3">
        <p className="text-sm text-[var(--text-primary)]">No power down completed on this date.</p>
        <p className="text-xs text-[var(--text-muted)]">Historical view is read-only — past sessions are never created retroactively.</p>
      </div>
    );
  }

  if (completed) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <PartyPopper className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Power Down Complete!</h2>
        <p className="text-[var(--text-secondary)] mb-6">Great work today. Rest well.</p>
        <button
          onClick={onComplete}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Dashboard
        </button>
      </m.div>
    );
  }

  const completedTasks = todayTasks.filter((t) => t.status === 'DONE');
  const incompleteTasks = todayTasks.filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED');

  const tomorrowDate = new Date(Date.now() + 86400000).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const timerDisplay = `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`;

  // Build deduped pool of all non-done tasks relevant to tomorrow planning
  const allTasksById = new Map<string, any>();
  for (const t of todayTasks) allTasksById.set(t.id, t);
  for (const t of tomorrowTasks) allTasksById.set(t.id, t);
  for (const g of weeklyGoals) {
    for (const t of (g.tasks ?? [])) {
      if (!allTasksById.has(t.id)) allTasksById.set(t.id, t);
    }
  }
  const candidateTasks = Array.from(allTasksById.values())
    .filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED');

  // Plain Map (not useMemo) because this code runs after the early returns
  // for loading/completed states — hooks may not appear in every render.
  const top3TaskLookup = new Map<string, any>();
  for (const t of tomorrowTasks) top3TaskLookup.set(t.id, t);
  for (const t of candidateTasks) top3TaskLookup.set(t.id, t);

  // Tasks for Steps 5+6: tomorrowPlan selections + tomorrowTasks (deduped)
  const planTasksById = new Map<string, any>();
  for (const id of tomorrowPlan) {
    const t = allTasksById.get(id);
    if (t) planTasksById.set(id, t);
  }
  for (const t of tomorrowTasks) planTasksById.set(t.id, t);
  const planTasks = Array.from(planTasksById.values());

  // For Steps 5+6: only tasks with a time block (actually scheduled on calendar)
  const scheduledPlanTasks = planTasks.filter((t) => t.timeBlockStart);


  return (
    <div className="max-w-2xl mx-auto">
      {/* Streak display */}
      {powerdownStreak > 0 && (
        <div className="flex items-center gap-2 mb-4 text-sm text-[var(--text-secondary)]">
          <Flame className="h-4 w-4 text-orange-400" />
          <span>{powerdownStreak}-day PowerDown streak</span>
        </div>
      )}

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map(({ num }) => (
          <div
            key={num}
            className={`h-2 flex-1 rounded-full transition-colors ${
              num < currentStep ? 'bg-green-500' : num === currentStep ? 'bg-indigo-500' : 'bg-[var(--surface-raised)]'
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
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              Step {currentStep}: {STEPS[currentStep - 1].title}
            </h2>
            <p className="text-[var(--text-secondary)] text-sm">{STEPS[currentStep - 1].description}</p>
          </div>

          {/* Step content */}
          <div className="glass-panel p-6">
            {/* Step 1: Review Today — task completion (with nested work blocks + clear goals) + AIM instances */}
            {currentStepKey === 'review_today' && (() => {
              const todayTaskIds = new Set(todayTasks.map((t) => t.id));
              const orphanWorkBlocks = todayWorkBlocks.filter((b) => !todayTaskIds.has(b.task.id));
              return (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      {completedTasks.length} of {todayTasks.length} tasks completed today.
                    </p>
                    {todayTasks.map((t) => {
                      const blocksForTask = todayWorkBlocks.filter((b) => b.task.id === t.id);
                      return (
                        <div key={t.id} className="space-y-2">
                          <button
                            onClick={() => toggleTaskStatus(t, fetchTodayTasks)}
                            className="flex items-center gap-2 text-sm w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--surface-raised)]/50 transition-colors"
                          >
                            {t.status === 'DONE' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                            )}
                            <span
                              className={
                                t.status === 'DONE'
                                  ? 'text-[var(--text-muted)] line-through'
                                  : 'text-[var(--text-primary)] font-medium'
                              }
                            >
                              {t.title}
                            </span>
                          </button>
                          {blocksForTask.length > 0 && (
                            <div className="ml-6 space-y-2">
                              {blocksForTask.map((b) => (
                                <div key={`cg-${b.id}`} className="rounded-lg bg-[var(--surface-raised)]/40 px-3 py-2">
                                  <div className="text-xs text-[var(--text-muted)]">
                                    {new Date(b.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                                    {new Date(b.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                  </div>
                                  <div className="text-xs text-indigo-300 mt-1">Objective: {b.mainObjective}</div>
                                  {b.clearGoals.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {b.clearGoals.map((g) => (
                                        <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={g.isComplete}
                                            onChange={() => toggleBlockClearGoal(g.id, g.isComplete)}
                                            className="rounded border-[var(--border-color)] text-indigo-500 focus:ring-indigo-500/30 h-3.5 w-3.5"
                                          />
                                          <span className={g.isComplete ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}>
                                            {g.text}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {todayTasks.length === 0 && overdueTasks.length === 0 && (
                      <p className="text-sm text-[var(--text-secondary)]">No tasks scheduled for today.</p>
                    )}
                  </div>

                  {overdueTasks.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Overdue tasks</h4>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mb-2">
                        {overdueTasks.length} {overdueTasks.length === 1 ? 'task' : 'tasks'} from the last 90 days.
                      </p>
                      {overdueTasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => toggleTaskStatus(t, fetchTodayTasks)}
                          className="flex items-center gap-2 text-sm w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--surface-raised)]/50 transition-colors"
                        >
                          {t.status === 'DONE' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                          )}
                          <span
                            className={
                              t.status === 'DONE'
                                ? 'text-[var(--text-muted)] line-through'
                                : 'text-[var(--text-primary)] font-medium'
                            }
                          >
                            {t.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {orphanWorkBlocks.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-indigo-400" />
                        <p className="text-sm text-[var(--text-secondary)] font-medium">Other work blocks</p>
                      </div>
                      {orphanWorkBlocks.map((b) => (
                        <div key={`orphan-${b.id}`} className="rounded-lg bg-[var(--surface-raised)]/40 px-3 py-2">
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            {b.task.title}
                            <span className="text-[var(--text-muted)] font-normal ml-2">
                              {new Date(b.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                              {new Date(b.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-xs text-indigo-300 mt-1">Objective: {b.mainObjective}</div>
                          {b.clearGoals.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {b.clearGoals.map((g) => (
                                <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={g.isComplete}
                                    onChange={() => toggleBlockClearGoal(g.id, g.isComplete)}
                                    className="rounded border-[var(--border-color)] text-indigo-500 focus:ring-indigo-500/30 h-3.5 w-3.5"
                                  />
                                  <span className={g.isComplete ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}>
                                    {g.text}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AIM Instances */}
                  {aimInstances.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span aria-hidden className="text-base leading-none">{PRISM_COLORS.AIM.emoji}</span>
                        <p className="text-sm text-[var(--text-secondary)] font-medium">Today&apos;s AIMs</p>
                      </div>
                      {aimInstances.map((aim) => (
                        <button
                          key={aim.id}
                          onClick={() => toggleAimInstance(aim)}
                          className="flex items-center gap-2 text-sm w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--surface-raised)]/50 transition-colors"
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: PRISM_COLORS.AIM.color }}
                          />
                          {aim.status === 'COMPLETED' ? (
                            <CheckCircle2 className="h-4 w-4 text-teal-400 flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                          )}
                          <span
                            className={
                              aim.status === 'COMPLETED'
                                ? 'text-[var(--text-muted)] line-through'
                                : 'text-[var(--text-primary)]'
                            }
                          >
                            {aim.title ?? aim.aim?.title ?? 'AIM'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Review Work Blocks & AIMs (conditional): per-item completion confirmation */}
            {currentStepKey === 'review_blocks' && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Did you complete today&apos;s scheduled work blocks and AIM sessions? Pick one for each — this feeds your progress history.
                </p>
                {todayWorkBlocks.length === 0 && aimInstances.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">Nothing to review yet — schedule some work.</p>
                )}
                {todayWorkBlocks.map((b) => {
                  const scheduledMin = minutesBetween(b.start, b.end);
                  const pick = blockReviewPicks[b.id];
                  return (
                    <div key={b.id} className="rounded-lg bg-[var(--surface-raised)]/50 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">{b.task.title}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {new Date(b.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                            {new Date(b.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            <span className="mx-1">•</span>
                            {scheduledMin}m scheduled
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-indigo-300">Objective: {b.mainObjective}</div>
                      <div className="flex gap-2">
                        {(['COMPLETED', 'PARTIAL', 'MISSED'] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setBlockReviewPicks((prev) => ({ ...prev, [b.id]: opt }))}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              pick === opt
                                ? opt === 'COMPLETED'
                                  ? 'bg-emerald-600 text-white'
                                  : opt === 'PARTIAL'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-gray-600 text-white'
                                : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
                            }`}
                          >
                            {opt === 'COMPLETED' ? 'Completed' : opt === 'PARTIAL' ? 'Partial' : 'Missed'}
                          </button>
                        ))}
                      </div>
                      {pick && pick !== 'MISSED' && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-[var(--text-muted)]">Actual time</label>
                          <input
                            type="number"
                            min={0}
                            max={480}
                            step={5}
                            value={blockReviewActual[b.id] ?? scheduledMin}
                            onChange={(e) =>
                              setBlockReviewActual((prev) => ({
                                ...prev,
                                [b.id]: Math.max(0, Math.min(480, Number(e.target.value) || 0)),
                              }))
                            }
                            className="w-20 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)]"
                          />
                          <span className="text-xs text-[var(--text-muted)]">min</span>
                        </div>
                      )}
                      <textarea
                        value={blockReviewNotes[b.id] ?? ''}
                        onChange={(e) => setBlockReviewNotes((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        placeholder="Optional notes"
                        rows={2}
                        className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      />
                      {b.task.status !== 'DONE' && (pick === 'PARTIAL' || pick === 'MISSED') && (
                        <div className="pt-1 border-t border-[var(--border-color)]">
                          {!taskExtendOpen[b.task.id] ? (
                            <button
                              type="button"
                              onClick={() => {
                                setTaskExtendOpen((p) => ({ ...p, [b.task.id]: true }));
                                setTaskExtendEstimate((p) => ({ ...p, [b.task.id]: b.task.estimatedMinutes }));
                                setTaskExtendDueDate((p) => ({ ...p, [b.task.id]: b.task.dueDate ? b.task.dueDate.split('T')[0] : '' }));
                              }}
                              className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              Task needs more time? Bump estimate or due date →
                            </button>
                          ) : (
                            <div className="space-y-2 pt-2">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-[var(--text-muted)] w-24">New estimate</label>
                                <input
                                  type="number"
                                  min={15}
                                  max={2400}
                                  step={15}
                                  value={taskExtendEstimate[b.task.id] ?? b.task.estimatedMinutes}
                                  onChange={(e) => setTaskExtendEstimate((p) => ({ ...p, [b.task.id]: Math.max(15, Math.min(2400, Number(e.target.value) || 0)) }))}
                                  className="w-24 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                />
                                <span className="text-xs text-[var(--text-muted)]">min (was {b.task.estimatedMinutes})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-[var(--text-muted)] w-24">Due date</label>
                                <input
                                  type="date"
                                  value={taskExtendDueDate[b.task.id] ?? ''}
                                  onChange={(e) => setTaskExtendDueDate((p) => ({ ...p, [b.task.id]: e.target.value }))}
                                  className="rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveTaskExtend(b.task.id)}
                                  disabled={!!taskExtendSaving[b.task.id]}
                                  className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                                >
                                  {taskExtendSaving[b.task.id] ? 'Saving…' : 'Save task changes'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTaskExtendOpen((p) => ({ ...p, [b.task.id]: false }))}
                                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* AIM instances for today */}
                {aimInstances.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-color)] pt-3 mt-2">
                    <p className="text-xs font-semibold text-teal-400 uppercase tracking-widest mb-1">
                      Today&apos;s AIM Sessions
                    </p>
                    {aimInstances.map((a) => {
                      const targetMin = a.aimCategory?.defaultDurationMin ?? 60;
                      return (
                        <CompletionReviewRow
                          key={`aim-${a.id}`}
                          item={{
                            kind: 'aim',
                            id: a.id,
                            scheduledDate: a.scheduledDate,
                            timeBlockStart: a.timeBlockStart,
                            timeBlockEnd: a.timeBlockEnd,
                            status: (aimReviewPicks[a.id] ?? a.status) as 'SCHEDULED' | 'COMPLETED' | 'SKIPPED' | 'MISSED',
                            aimCategory: a.aimCategory,
                            actualMinutes: a.actualMinutes ?? null,
                            targetMinutes: targetMin,
                          }}
                          currentStatus={aimReviewPicks[a.id]}
                          currentActualMinutes={aimReviewActual[a.id]}
                          onChange={(status, actualMinutes) => {
                            setAimReviewPicks((prev) => ({ ...prev, [a.id]: status as 'COMPLETED' | 'SKIPPED' | 'MISSED' }));
                            setAimReviewActual((prev) => ({ ...prev, [a.id]: actualMinutes }));
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 2 (conditional): Log Process KPIs */}
            {currentStepKey === 'log_kpis' && (
              <ProcessKpiLogStep processes={dueKpiProcesses} date={sessionDate} />
            )}

            {/* Step 2/3: Weekly Goals & Tasks */}
            {currentStepKey === 'weekly_goals' && (
              <div className="space-y-4">
                {weeklyGoalsLoading && (
                  <p className="text-sm text-[var(--text-secondary)]">Loading weekly goals...</p>
                )}
                {!weeklyGoalsLoading && weeklyGoals.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">No active weekly goals. You can skip this step.</p>
                )}
                {weeklyGoals.map((goal) => (
                  <div key={goal.id} className="rounded-lg bg-[var(--surface-raised)]/50 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                      <span className="text-sm text-[var(--text-primary)] font-medium">{goal.title}</span>
                      {goal.stack?.isCompany && (
                        <span className="ml-1 rounded-md bg-indigo-500/15 border border-indigo-500/40 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                          Company
                        </span>
                      )}
                    </div>
                    {goal.description && (
                      <p className="text-xs text-[var(--text-muted)] ml-6">{goal.description}</p>
                    )}

                    {/* Child tasks */}
                    {goal.tasks && goal.tasks.length > 0 && (
                      <div className="ml-6 space-y-1">
                        {goal.tasks.map((t: any) => (
                          <div key={t.id} className="rounded-lg px-2 py-1 space-y-1">
                            {editingTask === t.id ? (
                              <InlineTaskEdit
                                editTitle={editTitle}
                                editDescription={editDescription}
                                onTitleChange={setEditTitle}
                                onDescriptionChange={setEditDescription}
                                onSave={() => saveTaskEdit(t.id)}
                                onCancel={() => setEditingTask(null)}
                                size="sm"
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-sm">
                                <button
                                  onClick={() => toggleTaskStatus(t, fetchWeeklyGoals, fetchTodayTasks)}
                                  className="flex-shrink-0 hover:scale-110 transition-transform"
                                >
                                  {t.status === 'DONE' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                  ) : (
                                    <Circle className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                  )}
                                </button>
                                <span
                                  className={
                                    t.status === 'DONE'
                                      ? 'text-[var(--text-muted)] line-through text-xs flex-1'
                                      : 'text-[var(--text-primary)] text-xs flex-1'
                                  }
                                >
                                  {t.title}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingTask(t.id);
                                    setEditTitle(t.title);
                                    setEditDescription(t.description ?? '');
                                  }}
                                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex-shrink-0"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline task creation */}
                    <div className="ml-6 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTaskTitle[goal.id] ?? ''}
                          onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !newTaskExpanded[goal.id]) createTaskForGoal(goal.id);
                          }}
                          placeholder="Add a task for this goal..."
                          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={() => setNewTaskExpanded((prev) => ({ ...prev, [goal.id]: !prev[goal.id] }))}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 flex items-center gap-0.5"
                          title="More options"
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${newTaskExpanded[goal.id] ? 'rotate-180' : ''}`} />
                          <span>{newTaskExpanded[goal.id] ? 'Less' : 'More'}</span>
                        </button>
                        <button
                          onClick={() => createTaskForGoal(goal.id)}
                          className="text-xs rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500"
                        >
                          Add
                        </button>
                      </div>
                      {newTaskExpanded[goal.id] && (
                        <div className="space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/30 p-2">
                          <textarea
                            value={newTaskDescription[goal.id] ?? ''}
                            onChange={(e) => setNewTaskDescription((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                            placeholder="Description (optional)"
                            rows={2}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none resize-none"
                          />
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Due date</label>
                              <input
                                type="date"
                                value={newTaskDueDate[goal.id] || weekEnd}
                                onChange={(e) => setNewTaskDueDate((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Est. duration</label>
                              <select
                                value={newTaskDuration[goal.id] ?? 0}
                                onChange={(e) => setNewTaskDuration((prev) => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                              >
                                <option value={0}>No estimate</option>
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>1 hour</option>
                                <option value={90}>1.5 hours</option>
                                <option value={120}>2 hours</option>
                                <option value={180}>3 hours</option>
                                <option value={240}>4 hours</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Incomplete tasks from today */}
                {/* Upcoming-week React + Maintenance tasks — surfaces
                    operational work that isn't tied to a weekly Improve goal
                    so it doesn't get forgotten at planning time. */}
                {upcomingReactMaintTasks.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      React &amp; Maintenance — upcoming week ({upcomingReactMaintTasks.length})
                    </p>
                    {(['REACT', 'MAINTENANCE'] as const).map((kind) => {
                      const subset = upcomingReactMaintTasks.filter((t) => t.taskType === kind);
                      if (subset.length === 0) return null;
                      const colors = PRISM_COLORS[kind];
                      return (
                        <div key={kind} className="space-y-1">
                          <p className={`text-[10px] uppercase tracking-wider ${colors.textClass}`}>{colors.label}</p>
                          {subset.map((t) => (
                            <div
                              key={t.id}
                              className="rounded-lg bg-[var(--surface-raised)]/50 px-3 py-1.5 flex items-center gap-2 text-xs"
                            >
                              <Circle className="h-3 w-3 text-[var(--text-muted)] flex-shrink-0" />
                              <span className="text-[var(--text-primary)] truncate flex-1">{t.title}</span>
                              {t.goal?.title && (
                                <span className="text-[var(--text-muted)] truncate">{t.goal.title}</span>
                              )}
                              {t.dueDate && (
                                <span className="text-[var(--text-muted)] flex-shrink-0">
                                  {new Date(t.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {incompleteTasks.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Incomplete from today ({incompleteTasks.length})
                    </p>
                    {incompleteTasks.map((t) => (
                      <div key={t.id} className="rounded-lg bg-[var(--surface-raised)]/50 px-3 py-2 space-y-2">
                        {editingTask === t.id ? (
                          <InlineTaskEdit
                            editTitle={editTitle}
                            editDescription={editDescription}
                            onTitleChange={setEditTitle}
                            onDescriptionChange={setEditDescription}
                            onSave={() => saveTaskEdit(t.id)}
                            onCancel={() => setEditingTask(null)}
                          />
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-[var(--text-primary)]">{t.title}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingTask(t.id);
                                    setEditTitle(t.title);
                                    setEditDescription(t.description ?? '');
                                  }}
                                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                                >
                                  <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  onClick={() => setShowDatePicker((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                                  className="text-xs text-indigo-400 hover:text-indigo-300"
                                >
                                  Reschedule
                                </button>
                              </div>
                            </div>
                            {showDatePicker[t.id] && (
                              <div className="flex items-center gap-2 ml-4">
                                <input
                                  type="date"
                                  value={rescheduleDates[t.id] ?? sessionTomorrow}
                                  onChange={(e) => setRescheduleDates((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                  className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                                />
                                <button
                                  onClick={() => {
                                    const date = rescheduleDates[t.id] ?? sessionTomorrow;
                                    rescheduleTask(t.id, date);
                                  }}
                                  className="text-xs rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500"
                                >
                                  Confirm
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3/4: Select Top 3 for Tomorrow — uses the shared
                TopNTaskSelector so Powerdown and Weekly Review have one
                ranker (same look, same semantics, same upgrades). */}
            {currentStepKey === 'top3' && (
              <div className="space-y-3">
                <div className="mb-2">
                  <InlineTaskCreator
                    defaultDate={tomorrowDateRange.start}
                    placeholder="Add a quick task for tomorrow..."
                    onCreated={() => fetchTomorrowTasks()}
                  />
                </div>
                {candidateTasks.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">No tasks found. Add tasks in Step 2 first.</p>
                ) : (
                  <TopNTaskSelector
                    tasks={candidateTasks}
                    n={3}
                    selectedIds={tomorrowPlan}
                    onSelect={setTomorrowPlan}
                  />
                )}
              </div>
            )}

            {/* Step 4/5: Tomorrow's Calendar — full-screen modal overlay */}
            {currentStepKey === 'calendar' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-400" />
                    <p className="text-sm text-[var(--text-primary)] font-medium">{tomorrowDate}</p>
                  </div>
                  {tomorrowHoursProgress.hasTarget && (
                    <span
                      className={`text-xs rounded-md border px-2 py-0.5 font-medium ${
                        tomorrowHoursProgress.hit
                          ? 'bg-green-500/15 border-green-500/40 text-green-300'
                          : 'bg-[var(--surface-raised)] border-[var(--border-color)] text-[var(--text-secondary)]'
                      }`}
                      title={`${tomorrowHoursProgress.scheduledMinutes} min scheduled / ${dailyHoursTargetMinutes} min daily target`}
                    >
                      {tomorrowHoursProgress.scheduledHours} / {tomorrowHoursProgress.targetHours} hours
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Review and schedule tasks for tomorrow. Open the full calendar to drag tasks into time slots.
                </p>

                <button
                  onClick={() => setCalendarModalOpen(true)}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Open Calendar View
                </button>

                {/* Full-screen calendar modal — rendered via portal to escape stacking contexts */}
                {calendarModalOpen && createPortal(
                  <div className="fixed inset-0 z-[200] bg-black/80 flex items-start justify-center pt-3">
                    <div className="bg-[var(--surface-default,#fff)] dark:bg-[var(--surface-default,#1a1a2e)] rounded-xl w-[98vw] h-[calc(100vh-24px)] flex flex-col overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)]">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Tomorrow&apos;s Calendar</h3>
                        <button
                          onClick={() => {
                            setCalendarModalOpen(false);
                            setCalendarReviewed(true);
                          }}
                          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 p-2">
                        <CalendarSplitView
                          mode="schedule_tasks"
                          viewMode="day"
                          dateRange={tomorrowDateRange}
                          unscheduledItems={unscheduledTomorrowItems}
                          onUnschedule={handleItemUnscheduled}
                          onRefresh={refreshTomorrowLists}
                          onCreateWorkBlock={handleCreateWorkBlock}
                          onRequestNameWorkBlock={openAndAwaitNameModal}
                          aimBlockDuration={aimBlockDuration}
                          showWorkBlockTemplates
                          weeklyTargetCalendarIds={weeklyTargetCalendarIds}
                        />
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarReviewed}
                    onChange={(e) => setCalendarReviewed(e.target.checked)}
                    className="rounded border-[var(--border-color)] text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">I&apos;ve reviewed tomorrow&apos;s calendar</span>
                </label>

                {/* Scheduled subtasks (workblocks) for tomorrow */}
                <div className="mt-6 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Tomorrow&apos;s Scheduled Subtasks
                  </h3>
                  {tomorrowWorkBlocks.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Drag a task onto the calendar to create a scheduled subtask.
                    </p>
                  ) : (
                    tomorrowWorkBlocks.map((block) => {
                      const isDone = block.completionStatus === 'COMPLETED';
                      const scheduledMin = Math.max(
                        0,
                        Math.round((new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000),
                      );
                      return (
                        <div
                          key={block.id}
                          className={`rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/50 px-3 py-2 ${
                            isDone ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() =>
                                patchTomorrowWorkBlock(block.id, {
                                  completionStatus: isDone ? 'PENDING' : 'COMPLETED',
                                  actualMinutes: isDone ? null : scheduledMin,
                                })
                              }
                              className="mt-1 h-4 w-4 rounded border-[var(--border-color)] text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <input
                                key={`name:${block.mainObjective}`}
                                type="text"
                                defaultValue={block.mainObjective}
                                onBlur={(e) => {
                                  const next = e.target.value.trim();
                                  if (next && next !== block.mainObjective) {
                                    patchTomorrowWorkBlock(block.id, { mainObjective: next });
                                  }
                                }}
                                className={`w-full bg-transparent text-sm font-medium focus:outline-none ${
                                  isDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
                                }`}
                              />
                              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {new Date(block.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                  {'–'}
                                  {new Date(block.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                  <span className="ml-1">({scheduledMin}m)</span>
                                </span>
                                <span className="truncate">· {block.task.title}</span>
                              </div>
                              <textarea
                                key={`notes:${block.notes ?? ''}`}
                                defaultValue={block.notes ?? ''}
                                placeholder="Notes / description (optional)"
                                rows={1}
                                onBlur={(e) => {
                                  const next = e.target.value;
                                  if (next !== (block.notes ?? '')) {
                                    patchTomorrowWorkBlock(block.id, { notes: next || null });
                                  }
                                }}
                                className="w-full resize-y rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:border-indigo-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => rescheduleTomorrowWorkBlock(block)}
                                title="Reschedule"
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteTomorrowWorkBlock(block.id)}
                                title="Unschedule"
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            )}

            {/* ClearGoals are scoped to workBlockId so the Goal Clarity Summary
                step and the Today's Work Blocks dashboard read through the same path. */}
            {currentStepKey === 'clear_goals' && (() => {
              const items: Array<{ key: string; startMs: number; node: ReactNode }> = [];

              for (const block of tomorrowWorkBlocks) {
                items.push({
                  key: `wb-${block.id}`,
                  startMs: new Date(block.start).getTime(),
                  node: (
                    <ScheduledItemGoals
                      key={`wb-${block.id}`}
                      item={{ kind: 'workBlock', block }}
                      mode="inline"
                      powerdownId={session?.id}
                      onChange={fetchTomorrowWorkBlocks}
                    />
                  ),
                });
              }

              for (const aim of tomorrowAimInstances) {
                items.push({
                  key: `aim-${aim.id}`,
                  startMs: aim.timeBlockStart ? new Date(aim.timeBlockStart).getTime() : Number.MAX_SAFE_INTEGER,
                  node: (
                    <ScheduledItemGoals
                      key={`aim-${aim.id}`}
                      item={{ kind: 'aimInstance', aim }}
                      mode="inline"
                      onChange={fetchTomorrowAimInstances}
                    />
                  ),
                });
              }

              const workBlockTaskIds = new Set(tomorrowWorkBlocks.map((b) => b.task.id));
              const orphanTasks = scheduledPlanTasks.filter((t) => !workBlockTaskIds.has(t.id));
              for (const t of orphanTasks) {
                items.push({
                  key: `task-${t.id}`,
                  startMs: t.timeBlockStart ? new Date(t.timeBlockStart).getTime() : Number.MAX_SAFE_INTEGER,
                  node: (
                    <ScheduledItemGoals
                      key={`task-${t.id}`}
                      item={{ kind: 'taskOnly', task: { id: t.id, title: t.title, taskType: t.taskType, timeBlockStart: t.timeBlockStart, timeBlockEnd: t.timeBlockEnd } }}
                      mode="inline"
                      powerdownId={session?.id}
                    />
                  ),
                });
              }

              items.sort((a, b) => a.startMs - b.startMs);

              return (
                <>
                  <ClearGoalGuide isOpen={clearGoalGuideOpen} onToggle={() => setClearGoalGuideOpen(o => !o)} />
                  <div className="space-y-3">
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      For each session tomorrow, write the focus and the specific outcomes you&apos;ll deliver. Goals attach to the work block, so a task with two sessions tomorrow gets two independent goal lists.
                    </p>
                    {items.length === 0 ? (
                      <p className="text-sm text-[var(--text-secondary)]">
                        Nothing is scheduled for tomorrow. Go back to the Tomorrow&apos;s Calendar step to schedule sessions.
                      </p>
                    ) : (
                      items.map((i) => i.node)
                    )}
                  </div>
                </>
              );
            })()}

            {/* Lubricate Tomorrow — pre-stage the scheduled subtasks (workblocks). */}
            {currentStepKey === 'lubricate' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  For each scheduled subtask, go do the smallest physical
                  setup now — open the doc, type the title, save the file with
                  tomorrow&apos;s name, pin the tab. The goal is zero activation
                  energy when you sit down tomorrow. Starting is almost always
                  the hardest part; lubricate it tonight.
                </p>
                {tomorrowWorkBlocks.length > 0 ? (
                  <ul className="space-y-2">
                    {tomorrowWorkBlocks.map((block, i) => (
                      <li key={block.id} className="flex items-start gap-3 rounded-lg bg-[var(--surface-raised)]/50 px-4 py-3">
                        <span className="text-xs font-bold text-indigo-400 bg-indigo-400/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="block text-sm text-[var(--text-primary)]">{block.mainObjective}</span>
                          <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                            {block.task.title} · {new Date(block.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {'–'}
                            {new Date(block.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : tomorrowPlan.length > 0 ? (
                  <ul className="space-y-2">
                    {tomorrowPlan.map((taskId, i) => {
                      const t = top3TaskLookup.get(taskId);
                      const title = t?.title ?? 'Task';
                      return (
                        <li key={taskId} className="flex items-center gap-3 rounded-lg bg-[var(--surface-raised)]/50 px-4 py-3">
                          <span className="text-xs font-bold text-indigo-400 bg-indigo-400/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-sm text-[var(--text-primary)]">{title}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Nothing scheduled for tomorrow yet. Go back to step 6 to schedule some subtasks.
                  </p>
                )}
                <p className="text-xs text-[var(--text-muted)] italic">
                  This step is intentional friction — when you&apos;re done staging,
                  hit Next.
                </p>
              </div>
            )}

            {/* Step 6/7: Goal Clarity Summary — read-only preview of every
                scheduled item for tomorrow (work blocks, tasks due, AIMs).
                Keeps work-block rendering rich (mainObjective + linked task
                sub-line + time); tasks and AIMs render as plain rows. */}
            {currentStepKey === 'goal_summary' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Here&apos;s your plan for tomorrow. Review that each scheduled subtask has a clear goal.
                </p>
                {tomorrowWorkBlocks.length === 0 && tomorrowTasks.length === 0 && tomorrowAimInstances.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">Nothing is scheduled for tomorrow.</p>
                )}
                {tomorrowWorkBlocks.map((block) => {
                  const isTop3 = tomorrowPlan.includes(block.task.id);
                  const blockGoals = block.clearGoals;
                  // Fallback: task-level goals when the workblock doesn't have its own.
                  const taskLevelChecklist = blockGoals.length === 0 ? (goalChecklistsByTask[block.task.id] ?? []) : [];
                  return (
                    <div key={block.id} className={`rounded-lg px-4 py-3 space-y-1 ${isTop3 ? 'bg-indigo-600/10 border border-indigo-500/30' : 'bg-[var(--surface-raised)]/50'}`}>
                      <div className="flex items-center gap-2">
                        {isTop3 && <Star className="h-3.5 w-3.5 text-indigo-400 fill-indigo-400 flex-shrink-0" />}
                        <span className="text-sm text-[var(--text-primary)] font-medium">{block.mainObjective}</span>
                      </div>
                      <div className="ml-5 text-xs text-[var(--text-muted)]">
                        {block.task.title}
                      </div>
                      <div className="flex items-center gap-1 ml-5 text-xs text-[var(--text-muted)]">
                        <Clock className="h-3 w-3" />
                        <span>
                          {new Date(block.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' - '}
                          {new Date(block.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      {blockGoals.length > 0 ? (
                        <div className="ml-5 space-y-0.5">
                          {blockGoals.map((goal, i) => (
                            <div key={goal.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                              <span className="text-green-400">{i + 1}.</span>
                              <span>{goal.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : taskLevelChecklist.length > 0 ? (
                        <div className="ml-5 space-y-0.5">
                          <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Task-level goals</span>
                          {taskLevelChecklist.map((goal, i) => (
                            <div key={goal.id} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                              <span className="text-green-400">{i + 1}.</span>
                              <span>{goal.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-orange-400/80 ml-5">No clear goals set for this subtask.</p>
                      )}
                    </div>
                  );
                })}

                {/* Tasks due tomorrow that aren't already shown via a
                    workblock — dedupe against block.task.id so a task
                    scheduled into tomorrow doesn't double-render. */}
                {(() => {
                  const blockedTaskIds = new Set(tomorrowWorkBlocks.map((b) => b.task.id));
                  const unblockedTomorrowTasks = tomorrowTasks.filter((t) => !blockedTaskIds.has(t.id));
                  if (unblockedTomorrowTasks.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-4">
                        Tasks due tomorrow
                      </h3>
                      {unblockedTomorrowTasks.map((t) => {
                        const dueTime = t.dueDate ? new Date(t.dueDate) : null;
                        const hasTime = dueTime && (dueTime.getUTCHours() !== 0 || dueTime.getUTCMinutes() !== 0);
                        return (
                          <div key={t.id} className="rounded-lg px-4 py-2 bg-[var(--surface-raised)]/50 flex items-center gap-2">
                            <Circle className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                            <span className="text-sm text-[var(--text-primary)] flex-1 min-w-0 truncate">{t.title}</span>
                            {hasTime && (
                              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 flex-shrink-0">
                                <Clock className="h-3 w-3" />
                                {dueTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* AIMs scheduled tomorrow — habit anchors, not tasks. */}
                {tomorrowAimInstances.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-4">
                      AIMs tomorrow
                    </h3>
                    {tomorrowAimInstances.map((aim) => (
                      <div key={aim.id} className="rounded-lg px-4 py-2 bg-[var(--surface-raised)]/50 flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)] flex-1 min-w-0 truncate">
                          {aim.aimCategory?.name ?? 'AIM'}
                        </span>
                        {aim.timeBlockStart && aim.timeBlockEnd && (
                          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {new Date(aim.timeBlockStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {'–'}
                            {new Date(aim.timeBlockEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 7/8: Capture Ideas */}
            {currentStepKey === 'ideas' && (
              <ListCaptureStep
                items={ideas}
                setItems={setIdeas}
                icon={<Lightbulb className="h-5 w-5 text-yellow-400" />}
                prompt="Any ideas bouncing around? Get them out of your head."
                placeholder="Idea, thought, or shower insight..."
                emptyText="No ideas? That's fine -- skip ahead."
                color="yellow"
              />
            )}

            {/* Step 8/9: Record Distractions */}
            {currentStepKey === 'distractions' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                  <p className="text-sm text-[var(--text-secondary)]">What distracted you today?</p>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={distractionContent}
                    onChange={(e) => setDistractionContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && distractionContent.trim()) addDistraction();
                    }}
                    placeholder="e.g. Slack notifications, impromptu meeting..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={distractionNotes}
                    onChange={(e) => setDistractionNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && distractionContent.trim()) addDistraction();
                    }}
                    placeholder="Notes (optional) — how to prevent this next time?"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)] focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={addDistraction}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                  >
                    Add Distraction
                  </button>
                </div>
                {distractions.map((d, i) => (
                  <div key={i} className="rounded-lg bg-[var(--surface-raised)]/50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-primary)]">{d.content}</span>
                      <button
                        onClick={() => removeDistraction(i)}
                        className="text-[var(--text-muted)] hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {d.notes && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">{d.notes}</p>
                    )}
                  </div>
                ))}
                {distractions.length === 0 && (
                  <p className="text-xs text-[var(--text-secondary)]">No distractions recorded yet. Skip if it was a focused day!</p>
                )}
              </div>
            )}

            {/* Step 9: Daily Gratitude */}
            {currentStepKey === 'gratitude' && (
              <ListCaptureStep
                items={gratitudes}
                setItems={setGratitudes}
                icon={<Heart className="h-5 w-5 text-pink-400" />}
                prompt="What are you grateful for today?"
                placeholder="I'm grateful for..."
                color="pink"
              >
                <div className="text-center mb-4">
                  <span className="text-3xl font-mono text-[var(--text-primary)]">{timerDisplay}</span>
                  <div className="mt-2">
                    <button
                      onClick={() => setTimerRunning(!timerRunning)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        timerRunning
                          ? 'bg-red-600 text-white hover:bg-red-500'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {timerRunning ? 'Pause' : timerSeconds === 300 ? 'Start 5-min Timer' : 'Resume'}
                    </button>
                    {timerSeconds < 300 && !timerRunning && (
                      <button
                        onClick={() => setTimerSeconds(300)}
                        className="ml-2 rounded-lg bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </ListCaptureStep>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                onClick={goBack}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            <button
              onClick={advanceStep}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : currentStepKey === 'gratitude' ? 'Complete Power Down' : 'Next Step'}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </m.div>
      </AnimatePresence>

      <WorkBlockObjectiveModal
        open={!!nameModalInput}
        input={nameModalInput}
        mode={nameModalMode}
        editableStart={nameModalMode === 'edit'}
        onCancel={handleNameModalCancel}
        onSave={handleNameModalSave}
      />

    </div>
  );
}
