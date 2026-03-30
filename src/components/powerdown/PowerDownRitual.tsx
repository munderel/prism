'use client';

import { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import {
  CheckCircle2, ChevronRight, ChevronLeft, PartyPopper, AlertCircle,
  Heart, Lightbulb, Calendar, X, Circle, Pencil, Star, Flame, Target, Clock,
} from 'lucide-react';
import { getLocalDateString, getTomorrowDateString } from '@/lib/date-utils';
const CalendarSplitView = dynamic(
  () => import('@/components/calendar/CalendarSplitView').then(m => m.CalendarSplitView),
  { ssr: false, loading: () => <div className="text-[var(--text-muted)] py-4 text-center">Loading calendar...</div> }
);

// Power Down steps — reordered per Prism overhaul spec (2026-03-28)
// 1. Review Today → 2. Weekly Goals & Tasks → 3. Select Top 3 →
// 4. Calendar Split (tomorrow) → 5. Clear Goals → 6. Goal Clarity Summary →
// 7. Capture Ideas (auto-save) → 8. Distractions → 9. Gratitudes
const STEPS = [
  { num: 1, title: 'Review Today', description: 'Review today\'s completions and wins.' },
  { num: 2, title: 'Weekly Goals & Tasks', description: 'See your weekly goals with tasks. Update, create, and review incomplete tasks.' },
  { num: 3, title: 'Select Top 3 for Tomorrow', description: 'Pick your top 3 most important tasks for tomorrow, ranked 1st, 2nd, 3rd.' },
  { num: 4, title: "Tomorrow's Calendar", description: 'Drag tasks into tomorrow\'s time blocks. Fully editable — move, resize, or cancel blocks.' },
  { num: 5, title: 'Clear Goals', description: 'Create a clear goal checklist for each task scheduled tomorrow, starting with your top 3.' },
  { num: 6, title: 'Goal Clarity Summary', description: 'Final checklist of tomorrow\'s tasks with clear goals. Review and edit.' },
  { num: 7, title: 'Capture Ideas', description: 'Dump any ideas — they\'ll be auto-saved to your Ideas list.' },
  { num: 8, title: 'Record Distractions', description: 'What pulled you off track today? Log it so you can guard against it.' },
  { num: 9, title: 'Daily Gratitude', description: 'Spend a few minutes reflecting on what you\'re grateful for.' },
];

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

interface PowerDownRitualProps {
  onComplete: () => void;
}

export function PowerDownRitual({ onComplete }: PowerDownRitualProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const previousThemeRef = useRef<string | undefined>();
  // Capture today/tomorrow once at mount to avoid cross-midnight drift
  const [sessionToday] = useState(() => getLocalDateString());
  const [sessionTomorrow] = useState(() => getTomorrowDateString());
  const [session, setSession] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<any[]>([]);
  const [tomorrowPlan, setTomorrowPlan] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [powerdownStreak, setPowerdownStreak] = useState<number>(0);

  const [distractions, setDistractions] = useState<DistractionEntry[]>([]);
  const [distractionContent, setDistractionContent] = useState('');
  const [distractionNotes, setDistractionNotes] = useState('');
  const [gratitudes, setGratitudes] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [clearGoals, setClearGoals] = useState<any[]>([]);
  const [calendarReviewed, setCalendarReviewed] = useState(false);
  const [saving, setSaving] = useState(false);

  // AIM instances for Review Today step
  const [aimInstances, setAimInstances] = useState<any[]>([]);

  // Weekly goals for Weekly Goals & Tasks step
  const [weeklyGoals, setWeeklyGoals] = useState<any[]>([]);
  const [weeklyGoalsLoading, setWeeklyGoalsLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});

  // Calendar modal state
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  // Inline calendar state (now using CalendarSplitView)
  const [_userSettings, setUserSettings] = useState<{ workingHoursStart: string; workingHoursEnd: string } | null>(null);
  const [unscheduledTomorrowItems, setUnscheduledTomorrowItems] = useState<any[]>([]);

  // Reschedule step state
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState<Record<string, boolean>>({});
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Clear Goals step state — text checklists per task
  const [goalChecklists, setGoalChecklists] = useState<Record<string, string[]>>({});
  const [goalInput, setGoalInput] = useState<Record<string, string>>({});

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

  useEffect(() => {
    initSession();
    fetchTodayTasks();
    fetchTomorrowTasks();
    fetchPowerdownStreak();
    fetchUserSettings();
    fetchUnscheduledTomorrow();
    fetchAimInstances();
    fetchWeeklyGoals();
  }, []);

  const initSession = async () => {
    // Try to resume existing session
    let res = await fetch('/api/powerdown');
    let data = res.ok ? await res.json() : null;

    if (!data) {
      res = await fetch('/api/powerdown', { method: 'POST' });
      data = await res.json();
    }

    setSession(data);
    setCurrentStep(data.currentStep ?? 1);
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
    setClearGoals(data.clearGoals ?? []);
    setLoading(false);
  };

  const fetchTodayTasks = async () => {
    const res = await fetch(`/api/tasks?date=${sessionToday}`);
    if (res.ok) setTodayTasks(await res.json());
  };

  const fetchTomorrowTasks = useCallback(async () => {
    const tomorrow = sessionTomorrow;
    const res = await fetch(`/api/tasks?date=${tomorrow}`);
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

  const fetchUserSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings?scope=user');
      if (res.ok) {
        const data = await res.json();
        setUserSettings({
          workingHoursStart: data.workingHoursStart ?? '09:00',
          workingHoursEnd: data.workingHoursEnd ?? '21:00',
        });
      }
    } catch {
      // Non-critical — defaults will be used
    }
  }, []);

  const fetchUnscheduledTomorrow = useCallback(async () => {
    try {
      const [taskRes, aimRes] = await Promise.all([
        fetch('/api/tasks?status=TODO'),
        fetch('/api/aims/unscheduled'),
      ]);
      const tasks = taskRes.ok ? await taskRes.json() : [];
      const aims = aimRes.ok ? await aimRes.json() : [];

      const taskItems = tasks
        .filter((t: any) => !t.timeBlockStart)
        .map((t: any) => ({
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
      }));

      setUnscheduledTomorrowItems([...taskItems, ...aimItems]);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchAimInstances = useCallback(async () => {
    try {
      const res = await fetch(`/api/aims/instances?date=${sessionToday}`);
      if (res.ok) setAimInstances(await res.json());
    } catch {
      // Non-critical
    }
  }, []);

  const fetchWeeklyGoals = useCallback(async () => {
    setWeeklyGoalsLoading(true);
    try {
      const res = await fetch('/api/goals?level=WEEKLY&status=IN_PROGRESS');
      if (res.ok) {
        const goalsRaw = await res.json();
        const goals = Array.isArray(goalsRaw) ? goalsRaw : [];
        // Fetch child tasks for each goal
        const goalsWithTasks = await Promise.all(
          goals.map(async (g: any) => {
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
      }
    } catch {
      // Non-critical
    } finally {
      setWeeklyGoalsLoading(false);
    }
  }, []);

  const toggleAimInstance = async (instance: any) => {
    const newCompleted = !instance.completed;
    try {
      await fetch(`/api/aims/instances/${instance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newCompleted }),
      });
      fetchAimInstances();
    } catch {
      // Non-critical
    }
  };

  const createTaskForGoal = async (goalId: string) => {
    const title = (newTaskTitle[goalId] ?? '').trim();
    if (!title) return;
    try {
      const tomorrow = sessionTomorrow;
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, goalId, dueDate: tomorrow, status: 'TODO', taskType: 'IMPROVE' }),
      });
      setNewTaskTitle((prev) => ({ ...prev, [goalId]: '' }));
      fetchWeeklyGoals();
      fetchTomorrowTasks();
    } catch {
      // Non-critical
    }
  };

  const handleItemScheduled = useCallback(async (itemId: string, itemType: string, start: Date, end: Date) => {
    if (itemType === 'task') {
      await fetch(`/api/tasks/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeBlockStart: start.toISOString(),
          timeBlockEnd: end.toISOString(),
        }),
      });
    } else if (itemType === 'aim') {
      const instanceId = itemId.startsWith('aim-instance-')
        ? itemId.replace('aim-instance-', '') : null;
      if (instanceId) {
        await fetch(`/api/aims/instances/${instanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeBlockStart: start.toISOString(),
            timeBlockEnd: end.toISOString(),
          }),
        });
      }
    }
    setUnscheduledTomorrowItems((prev) => prev.filter((item) => item.id !== itemId));
    setCalendarReviewed(true);
    fetchTomorrowTasks();
  }, [fetchTomorrowTasks]);

  const handleItemUnscheduled = useCallback(async (itemId: string, itemType: string) => {
    if (itemType === 'task') {
      await fetch(`/api/tasks/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: null, timeBlockEnd: null }),
      });
    }
    fetchUnscheduledTomorrow();
    fetchTomorrowTasks();
  }, [fetchUnscheduledTomorrow, fetchTomorrowTasks]);

  const persistStep = async (nextStep: number, extra: Record<string, any> = {}) => {
    if (!session) return;
    await fetch('/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        currentStep: nextStep,
        tomorrowPlan,
        distractions,
        gratitudes,
        ideas,
        clearGoals,
        ...extra,
      }),
    });
  };

  const advanceStep = async () => {
    if (!session || saving) return;
    setSaving(true);
    try {
    const next = currentStep + 1;

    // On step 8 completion, persist distractions to DistractionLog API
    if (currentStep === 8 && distractions.length > 0) {
      for (const d of distractions) {
        try {
          await fetch('/api/distractions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: d.content,
              notes: d.notes || null,
              logDate: sessionToday,
              source: 'powerdown',
            }),
          });
        } catch {
          // Non-critical — session JSON still has the data
        }
      }
    }

    if (next > 9) {
      // Complete session
      await persistStep(9, { complete: true });
      // Update powerdown streak
      try {
        await fetch('/api/streaks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ streakType: 'powerdown' }),
        });
      } catch {
        // Streak update is non-critical
      }
      // Auto-save captured ideas to /api/ideas
      if (ideas && ideas.length > 0) {
        for (const idea of ideas) {
          if (idea.trim()) {
            await fetch('/api/ideas', {
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
        }
      }
      setCompleted(true);
      return;
    }

    await persistStep(next);
    setCurrentStep(next);
    } finally {
      setSaving(false);
    }
  };

  const goBack = async () => {
    if (currentStep <= 1 || saving) return;
    setSaving(true);
    try {
      const prev = currentStep - 1;
      await persistStep(prev);
      setCurrentStep(prev);
    } finally {
      setSaving(false);
    }
  };

  const toggleTaskCompletion = async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTodayTasks();
  };

  const toggleWeeklyTaskCompletion = async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchWeeklyGoals();
    fetchTodayTasks();
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

  const toggleTop3 = (taskId: string) => {
    if (tomorrowPlan.includes(taskId)) {
      setTomorrowPlan(tomorrowPlan.filter((id) => id !== taskId));
    } else if (tomorrowPlan.length < 3) {
      setTomorrowPlan([...tomorrowPlan, taskId]);
    }
  };

  const addGoalChecklistItem = (taskId: string) => {
    const text = (goalInput[taskId] ?? '').trim();
    if (!text) return;
    setGoalChecklists((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] ?? []), text],
    }));
    setGoalInput((prev) => ({ ...prev, [taskId]: '' }));
    // Sync to clearGoals state for persistence
    setClearGoals((prev) => {
      const existing = prev.find((cg) => cg.taskId === taskId);
      if (existing) {
        return prev.map((cg) =>
          cg.taskId === taskId ? { ...cg, steps: [...(cg.steps ?? []), text] } : cg,
        );
      }
      const task = [...tomorrowTasks, ...todayTasks, ...weeklyGoals.flatMap((g: any) => g.tasks ?? [])].find((t: any) => t.id === taskId);
      return [...prev, { taskId, taskTitle: task?.title ?? '', steps: [text] }];
    });
  };

  const removeGoalChecklistItem = (taskId: string, index: number) => {
    setGoalChecklists((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((_, i) => i !== index),
    }));
    setClearGoals((prev) =>
      prev.map((cg) =>
        cg.taskId === taskId
          ? { ...cg, steps: (cg.steps ?? []).filter((_: any, i: number) => i !== index) }
          : cg,
      ),
    );
  };

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;

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

  // Tasks for Steps 5+6: tomorrowPlan selections + tomorrowTasks (deduped)
  const planTasksById = new Map<string, any>();
  for (const id of tomorrowPlan) {
    const t = allTasksById.get(id);
    if (t) planTasksById.set(id, t);
  }
  for (const t of tomorrowTasks) planTasksById.set(t.id, t);
  const planTasks = Array.from(planTasksById.values());

  // Group planTasks by type for Clear Goals step (Steps 5+6)
  const tasksByType: Record<string, any[]> = {};
  for (const t of planTasks) {
    const type = t.taskType ?? 'OTHER';
    if (!tasksByType[type]) tasksByType[type] = [];
    tasksByType[type].push(t);
  }
  const typeLabels: Record<string, string> = {
    IMPROVE: 'Improve',
    REACT: 'React',
    MAINTENANCE: 'Maintenance',
    OTHER: 'Other',
  };

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
            {/* Step 1: Review Today — task completion + AIM instances */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    {completedTasks.length} of {todayTasks.length} tasks completed today.
                  </p>
                  {todayTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTaskCompletion(t)}
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
                  ))}
                  {todayTasks.length === 0 && (
                    <p className="text-sm text-[var(--text-secondary)]">No tasks scheduled for today.</p>
                  )}
                </div>

                {/* AIM Instances */}
                {aimInstances.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-purple-400" />
                      <p className="text-sm text-[var(--text-secondary)] font-medium">Today&apos;s AIMs</p>
                    </div>
                    {aimInstances.map((aim) => (
                      <button
                        key={aim.id}
                        onClick={() => toggleAimInstance(aim)}
                        className="flex items-center gap-2 text-sm w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--surface-raised)]/50 transition-colors"
                      >
                        {aim.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                        )}
                        <span
                          className={
                            aim.completed
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
            )}

            {/* Step 2: Weekly Goals & Tasks */}
            {currentStep === 2 && (
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
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  placeholder="Task title"
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  placeholder="Description (optional)"
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveTaskEdit(t.id)}
                                    className="text-xs rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTask(null)}
                                    className="text-xs rounded bg-[var(--surface)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm">
                                <button
                                  onClick={() => toggleWeeklyTaskCompletion(t)}
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
                    <div className="flex gap-2 ml-6">
                      <input
                        type="text"
                        value={newTaskTitle[goal.id] ?? ''}
                        onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createTaskForGoal(goal.id);
                        }}
                        placeholder="Add a task for this goal..."
                        className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={() => createTaskForGoal(goal.id)}
                        className="text-xs rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}

                {/* Incomplete tasks from today */}
                {incompleteTasks.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Incomplete from today ({incompleteTasks.length})
                    </p>
                    {incompleteTasks.map((t) => (
                      <div key={t.id} className="rounded-lg bg-[var(--surface-raised)]/50 px-3 py-2 space-y-2">
                        {editingTask === t.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="Task title"
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Description (optional)"
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveTaskEdit(t.id)}
                                className="text-xs rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingTask(null)}
                                className="text-xs rounded bg-[var(--surface)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
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

            {/* Step 3: Select Top 3 for Tomorrow */}
            {currentStep === 3 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-indigo-400" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Select up to 3 most important tasks for tomorrow ({tomorrowPlan.length}/3 selected).
                  </p>
                </div>
                {candidateTasks.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">No tasks found. Add tasks in Step 2 first.</p>
                )}
                {candidateTasks.map((t) => {
                  const isSelected = tomorrowPlan.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTop3(t.id)}
                      disabled={!isSelected && tomorrowPlan.length >= 3}
                      className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                        isSelected
                          ? 'bg-indigo-600/15 border border-indigo-500/50'
                          : 'bg-[var(--surface-raised)] border border-[var(--border-color)] hover:border-indigo-500/30'
                      } ${!isSelected && tomorrowPlan.length >= 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isSelected ? (
                        <Star className="h-4 w-4 text-indigo-400 fill-indigo-400 flex-shrink-0" />
                      ) : (
                        <Star className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                      )}
                      <span className={`text-sm ${isSelected ? 'text-indigo-500 dark:text-indigo-300 font-medium' : 'text-[var(--text-primary)]'}`}>
                        {t.title}
                      </span>
                      {isSelected && (
                        <span className="ml-auto text-xs rounded-full bg-indigo-600/20 px-2 py-0.5 text-indigo-600 dark:text-indigo-300 font-medium">
                          Most Important
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 4: Tomorrow's Calendar — full-screen modal overlay */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-5 w-5 text-indigo-400" />
                  <p className="text-sm text-[var(--text-primary)] font-medium">{tomorrowDate}</p>
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
                  <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center">
                    <div className="bg-[var(--surface-default,#fff)] dark:bg-[var(--surface-default,#1a1a2e)] rounded-xl w-[95vw] h-[90vh] flex flex-col overflow-hidden shadow-2xl">
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
                          viewMode="day"
                          dateRange={{
                            start: new Date(Date.now() + 86400000).toISOString(),
                            end: new Date(Date.now() + 2 * 86400000).toISOString(),
                          }}
                          unscheduledItems={unscheduledTomorrowItems}
                          onSchedule={handleItemScheduled}
                          onUnschedule={handleItemUnscheduled}
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
              </div>
            )}

            {/* Step 5: Clear Goals */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  For each task, add specific outcomes you&apos;ll achieve. e.g., &quot;Complete first draft of proposal sections 1-3&quot;
                </p>
                {planTasks.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">No tasks selected yet. Go back to Step 3 to pick your top tasks.</p>
                )}
                {Object.entries(tasksByType).map(([type, tasks]) => (
                  <div key={type} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {typeLabels[type] ?? type}
                    </h3>
                    {tasks.map((t) => {
                      const checklist = goalChecklists[t.id] ?? clearGoals.find((cg) => cg.taskId === t.id)?.steps ?? [];
                      return (
                        <div key={t.id} className="rounded-lg bg-[var(--surface-raised)]/50 px-3 py-2 space-y-2">
                          <span className="text-sm text-[var(--text-primary)] font-medium">{t.title}</span>
                          {checklist.length > 0 && (
                            <div className="ml-4 space-y-1">
                              {checklist.map((step: string, i: number) => (
                                <div key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                                  <span className="text-indigo-400">{i + 1}.</span>
                                  <span className="flex-1">{typeof step === 'string' ? step : (step as any).title || (step as any).step}</span>
                                  <button
                                    onClick={() => removeGoalChecklistItem(t.id, i)}
                                    className="text-[var(--text-muted)] hover:text-red-400"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 ml-4">
                            <input
                              type="text"
                              value={goalInput[t.id] ?? ''}
                              onChange={(e) => setGoalInput((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') addGoalChecklistItem(t.id);
                              }}
                              placeholder="Add a specific outcome..."
                              className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                            />
                            <button
                              onClick={() => addGoalChecklistItem(t.id)}
                              className="text-xs rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Step 6: Goal Clarity Summary — read-only preview */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Here&apos;s your plan for tomorrow. Review that each task has a clear goal.
                </p>
                {planTasks.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">No tasks planned for tomorrow.</p>
                )}
                {planTasks.map((t) => {
                  const isTop3 = tomorrowPlan.includes(t.id);
                  const checklist = goalChecklists[t.id] ?? clearGoals.find((cg) => cg.taskId === t.id)?.steps ?? [];
                  return (
                    <div key={t.id} className={`rounded-lg px-4 py-3 space-y-1 ${isTop3 ? 'bg-indigo-600/10 border border-indigo-500/30' : 'bg-[var(--surface-raised)]/50'}`}>
                      <div className="flex items-center gap-2">
                        {isTop3 && <Star className="h-3.5 w-3.5 text-indigo-400 fill-indigo-400 flex-shrink-0" />}
                        <span className="text-sm text-[var(--text-primary)] font-medium">{t.title}</span>
                      </div>
                      {t.timeBlockStart && (
                        <div className="flex items-center gap-1 ml-5 text-xs text-[var(--text-muted)]">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(t.timeBlockStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {t.timeBlockEnd && ` - ${new Date(t.timeBlockEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                          </span>
                        </div>
                      )}
                      {checklist.length > 0 ? (
                        <div className="ml-5 space-y-0.5">
                          {checklist.map((step: string, i: number) => (
                            <div key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                              <span className="text-green-400">{i + 1}.</span>
                              <span>{typeof step === 'string' ? step : (step as any).title || (step as any).step}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-orange-400/80 ml-5">No clear goals set for this task.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 7: Capture Ideas */}
            {currentStep === 7 && (
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

            {/* Step 8: Record Distractions */}
            {currentStep === 8 && (
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
            {currentStep === 9 && (
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
              {saving ? 'Saving...' : currentStep === 9 ? 'Complete Power Down' : 'Next Step'}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
