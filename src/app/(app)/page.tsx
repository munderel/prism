'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Focus, AlertTriangle, Lightbulb, Moon, Check, Flame, ChevronDown, Inbox } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getLocalDateString, toLocalDateKey, formatDisplayDate } from '@/lib/date-utils';
import { useToast } from '@/components/ui/ToastProvider';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { ClearGoalsDisplay } from '@/components/tasks/ClearGoalsDisplay';
import { SubtaskList } from '@/components/tasks/SubtaskList';
import { WinTheDayCard } from '@/components/dashboard/WinTheDayCard';
import { ReviewDueBanner, type ReviewDueItem } from '@/components/reviews/ReviewDueBanner';
const WinTheDayCelebration = dynamic(
  () => import('@/components/dopamine/WinTheDayCelebration').then((m) => m.WinTheDayCelebration),
  { ssr: false }
);
import { FocusView } from '@/components/dashboard/FocusView';
import { DashboardTimeline } from '@/components/dashboard/DashboardTimeline';
import { TodayWorkBlocks } from '@/components/dashboard/TodayWorkBlocks';
import { QuickAddMenu } from '@/components/dashboard/QuickAddMenu';
import { PRISM_COLORS } from '@/lib/prism-colors';
import { setTimeOnDate } from '@/lib/scheduling-engine';
import { useUserSettings } from '@/hooks/useUserSettings';
import type { BufferDerailInfo as DerailInfo } from '@/lib/derailing-buffer';

// --- Dashboard-specific interfaces based on API response shapes ---

/** Task as returned by GET /api/tasks (Prisma Task + included relations) */
interface DashboardTask {
  id: string;
  ownerId: string;
  goalId: string | null;
  processId: string | null;
  taskType: 'IMPROVE' | 'REACT' | 'MAINTENANCE' | 'REVIEW';
  title: string;
  description: string | null;
  deliverable: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  recurrenceRule: string | null;
  calendarEventId: string | null;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  estimatedMinutes: number;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  isPinned: boolean;
  isAutoScheduled: boolean;
  isWinTheDay: boolean;
  winTheDayRank: number | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  rescheduledTo: string | null;
  createdAt: string;
  updatedAt: string;
  aimInstanceId: string | null;
  assigneeId: string | null;
  goal?: { id: string; title: string; level: string; stack?: { name: string } } | null;
  processExecution?: { process: { title: string } } | null;
  _count?: { comments: number; children: number };
  children?: { id: string; title: string; status: string; priority: string; dueDate: string | null; completedAt: string | null }[];
}

/** AIM instance as returned by GET /api/aims/instances (Prisma AimInstance + included relations) */
interface DashboardAimInstance {
  id: string;
  userId: string;
  aimCategoryId: string;
  scheduledDate: string;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  isGroupOpen: boolean;
  status: string;
  completedAt: string | null;
  activityNote: string | null;
  selectedActivity: string | null;
  phaseAtCompletion: string | null;
  pointsEarned: number;
  createdAt: string;
  aimCategory: { id: string; name: string; [key: string]: unknown };
  user?: { id: string; name: string | null; image: string | null };
}

interface DerailBatchResponse {
  [aimCategoryId: string]: {
    derailInfo: DerailInfo;
    history: { date: string; completed: boolean; status: string }[];
    expectedPerDay: number;
  };
}

const FOCUS_MODE_KEY = 'prism-focus-mode';

/** Calendar event sources already handled by dedicated SWR fetches (tasks, aims, powerdown). */
const CALENDAR_SKIP_SOURCES = new Set(['tasks', 'aims', 'powerdown']);

/** Maps calendar API `source` values to DashboardTimeline block types. */
const CALENDAR_SOURCE_TYPE_MAP: Record<string, 'GOOGLE_CAL' | 'MEETING' | 'REVIEW' | 'MAINTENANCE'> = {
  google: 'GOOGLE_CAL',
  meeting: 'MEETING',
  reviews: 'REVIEW',
  review: 'REVIEW',
  processes: 'MAINTENANCE',
};

export default function DashboardPage() {
  const toast = useToast();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [today, setToday] = useState(() => getLocalDateString());
  const [editingTask, setEditingTask] = useState<DashboardTask | 'new' | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');

  useEffect(() => {
    const stored = localStorage.getItem(FOCUS_MODE_KEY);
    if (stored === 'true') setFocusMode(true);

    // Update 'today' when the page becomes visible after midnight
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = getLocalDateString();
        setToday((prev) => (prev !== now ? now : prev));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const toggleFocusMode = () => {
    setFocusMode((prev) => {
      const next = !prev;
      localStorage.setItem(FOCUS_MODE_KEY, String(next));
      return next;
    });
  };

  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  // Calculate week range for weekly view
  // Week starts on Sunday (consistent with Calendar page)
  const weekRange = useMemo(() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sunday
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return {
      start: getLocalDateString(sunday),
      end: getLocalDateString(saturday),
    };
  }, [today]);

  const taskKey = viewMode === 'weekly'
    ? `/api/tasks?startDate=${weekRange.start}&endDate=${weekRange.end}`
    : `/api/tasks?date=${today}`;
  const { data: tasks, mutate, isLoading: tasksLoading } = useSWR<DashboardTask[]>(taskKey, { revalidateOnFocus: true });
  const list: DashboardTask[] = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);

  // Separate fetch for unscheduled tasks
  const { data: unscheduledTasks, mutate: mutateUnscheduled } = useSWR<DashboardTask[]>('/api/tasks?unscheduledOnly=true');
  const unscheduledList: DashboardTask[] = useMemo(() => (Array.isArray(unscheduledTasks) ? unscheduledTasks : []), [unscheduledTasks]);

  // Reviews due in the visible window (today or current week). Surfaces the
  // review as a banner so the user can complete it without navigating away.
  const reviewsBannerKey = viewMode === 'weekly'
    ? `/api/reviews?scope=individual&from=${weekRange.start}&to=${weekRange.end}`
    : `/api/reviews?scope=individual&from=${today}&to=${today}`;
  const { data: reviewsBannerData } = useSWR<ReviewDueItem[]>(reviewsBannerKey);
  const reviewsDue: ReviewDueItem[] = useMemo(
    () => (Array.isArray(reviewsBannerData) ? reviewsBannerData : []),
    [reviewsBannerData],
  );

  // Group tasks by day for weekly view
  const weeklyGrouped = useMemo(() => {
    if (viewMode !== 'weekly') return {};
    const groups: Record<string, DashboardTask[]> = {};
    // Initialize all 7 days
    const mon = new Date(weekRange.start + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      groups[getLocalDateString(d)] = [];
    }
    for (const t of list) {
      const dateKey = t.dueDate ? toLocalDateKey(t.dueDate) : weekRange.start;
      if (groups[dateKey]) {
        groups[dateKey].push(t);
      } else {
        // Task date outside range, put on first day
        groups[weekRange.start]?.push(t);
      }
    }
    return groups;
  }, [viewMode, list, weekRange]);

  // Fetch AIM instances — daily or weekly based on view
  const aimSWRKey = viewMode === 'weekly'
    ? `/api/aims/instances?start=${weekRange.start}T00:00:00&end=${weekRange.end}T23:59:59`
    : `/api/aims/instances?start=${today}T00:00:00&end=${today}T23:59:59`;
  const { data: aimInstances, mutate: mutateAims } = useSWR<DashboardAimInstance[]>(aimSWRKey);
  const aimList: DashboardAimInstance[] = useMemo(() => (Array.isArray(aimInstances) ? aimInstances : []), [aimInstances]);

  // Batch-fetch derail info
  const { data: derailBatch } = useSWR<DerailBatchResponse>('/api/aims/derail-batch?days=14');

  // Fetch streak data for dashboard display
  const { data: allStreaks } = useSWR<{ id: string; streakType: string; currentCount: number; bestCount: number; lastActiveDate: string | null; isActive: boolean }[]>('/api/streaks');
  const dailyStreak = useMemo(() => (allStreaks ?? []).find((s) => s.streakType === 'daily'), [allStreaks]);

  // Fetch user settings and today's PowerDown session
  const { data: userSettings } = useUserSettings();
  const { data: powerdownSession, mutate: mutatePowerdown } = useSWR<{ id: string; sessionDate: string; timeBlockStart: string | null; timeBlockEnd: string | null; completedAt: string | null } | null>('/api/powerdown');

  // Fetch external calendar events (Google, meetings, reviews, processes) for the timeline
  // Uses 'external' source to avoid re-fetching tasks/aims/powerdown already handled above
  const calendarSWRKey = `/api/calendar?start=${today}T00:00:00&end=${today}T23:59:59&source=external`;
  const { data: calendarEvents } = useSWR<any[]>(calendarSWRKey);

  // Build timeline blocks from tasks + AIMs
  const timelineBlocks = useMemo(() => {
    const blocks: Array<{ id: string; title: string; start: string; end: string; type: 'IMPROVE' | 'REACT' | 'MAINTENANCE' | 'AIM' | 'REVIEW' | 'GOOGLE_CAL' | 'POWER_DOWN' | 'MEETING' }> = [];

    for (const t of list) {
      if (t.timeBlockStart && t.timeBlockEnd) {
        blocks.push({
          id: t.id,
          title: t.title,
          start: t.timeBlockStart,
          end: t.timeBlockEnd,
          type: t.taskType || 'IMPROVE',
        });
      }
    }

    for (const aim of aimList) {
      if (aim.timeBlockStart && aim.timeBlockEnd) {
        blocks.push({
          id: aim.id,
          title: aim.aimCategory?.name ?? 'AIM',
          start: aim.timeBlockStart,
          end: aim.timeBlockEnd,
          type: 'AIM',
        });
      }
    }

    // Inject calendar events (Google, meetings, reviews, processes) — skip sources already handled above
    if (Array.isArray(calendarEvents)) {
      for (const ev of calendarEvents) {
        if (CALENDAR_SKIP_SOURCES.has(ev.source) || !ev.start || !ev.end || ev.allDay) continue;
        const mappedType = CALENDAR_SOURCE_TYPE_MAP[ev.source];
        if (!mappedType) continue;
        blocks.push({
          id: ev.id,
          title: ev.title ?? 'Event',
          start: ev.start,
          end: ev.end,
          type: mappedType,
        });
      }
    }

    // Inject Power Down block from user settings or session overrides
    if (userSettings?.powerdownTime || powerdownSession?.timeBlockStart) {
      let pdStart: string | null = null;
      let pdEnd: string | null = null;

      if (powerdownSession?.timeBlockStart && powerdownSession?.timeBlockEnd) {
        pdStart = powerdownSession.timeBlockStart;
        pdEnd = powerdownSession.timeBlockEnd;
      } else if (userSettings?.powerdownTime) {
        const s = setTimeOnDate(new Date(), userSettings.powerdownTime);
        const e = new Date(s.getTime() + 30 * 60 * 1000);
        pdStart = s.toISOString();
        pdEnd = e.toISOString();
      }

      if (pdStart && pdEnd) {
        blocks.push({
          id: 'powerdown',
          title: 'Power Down',
          start: pdStart,
          end: pdEnd,
          type: 'POWER_DOWN',
        });
      }
    }

    return blocks;
  }, [list, aimList, userSettings, powerdownSession, calendarEvents]);

  // Win the Day: top 3 ranked tasks from power-down (excludes completed tasks)
  const winTheDayTasks = useMemo(() => {
    const wtdTasks = list.filter(
      (t) => t.isWinTheDay && t.status !== 'DONE' && t.status !== 'DROPPED',
    );
    // Sort by user-selected rank; fall back to priority for tasks without a stored rank
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    wtdTasks.sort((a, b) => {
      const ra = a.winTheDayRank ?? 99;
      const rb = b.winTheDayRank ?? 99;
      if (ra !== rb) return ra - rb;
      return (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    });
    return wtdTasks.slice(0, 3).map((t, i) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      rank: t.winTheDayRank ?? i + 1,
      timeBlockStart: t.timeBlockStart ?? undefined,
      timeBlockEnd: t.timeBlockEnd ?? undefined,
    }));
  }, [list]);

  const prevWtdStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (winTheDayTasks.length > 0) {
      const top = winTheDayTasks[0];
      if (prevWtdStatusRef.current && prevWtdStatusRef.current !== 'DONE' && top.status === 'DONE') {
        setShowWinCelebration(true);
      }
      prevWtdStatusRef.current = top.status;
    }
  }, [winTheDayTasks]);

  // Group tasks by type for checklist view
  const groupedTasks = useMemo(() => {
    // REVIEW is intentionally omitted: weekly/monthly/yearly reviews are
    // Review rows (not Task rows) and surface via the pink ReviewDueBanner.
    const groups: Record<string, DashboardTask[]> = {
      IMPROVE: [],
      REACT: [],
      MAINTENANCE: [],
    };
    const todayStr = getLocalDateString();
    const visible = list.filter((t) => {
      if (t.status === 'DROPPED') return showDoneTasks;
      if (t.status === 'DONE') {
        // Show today's completed tasks in-place (strikethrough); older completions only when toggled
        if (t.completedAt && t.completedAt.startsWith(todayStr)) return true;
        return showDoneTasks;
      }
      return true;
    });
    for (const t of visible) {
      const type = t.taskType || 'IMPROVE';
      if (groups[type]) {
        groups[type].push(t);
      } else {
        groups.IMPROVE.push(t);
      }
    }
    return groups;
  }, [list, showDoneTasks]);

  const doneTotalDashboard = useMemo(
    () => {
      const todayStr = getLocalDateString();
      return list.filter((t) => (t.status === 'DONE' || t.status === 'DROPPED') && !(t.completedAt && t.completedAt.startsWith(todayStr))).length;
    },
    [list],
  );

  const refresh = useCallback(() => {
    mutate();
    setEditingTask(null);
  }, [mutate]);

  const handleEdit = useCallback((task: DashboardTask) => setEditingTask(task), []);
  const handleDelete = useCallback(async (id: string) => {
    // Optimistic removal
    mutate((prev: DashboardTask[] | undefined) =>
      (Array.isArray(prev) ? prev : []).filter((t) => t.id !== id),
      false
    );
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    mutate();
    mutateUnscheduled();
  }, [mutate, mutateUnscheduled]);
  const handleWinTheDayToggle = useCallback(async (task: DashboardTask) => {
    const newValue = !task.isWinTheDay;
    mutate(
      (prev: DashboardTask[] | undefined) =>
        (Array.isArray(prev) ? prev : []).map((t) =>
          t.id === task.id ? { ...t, isWinTheDay: newValue } : t
        ),
      false
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: newValue }),
    });
    mutate();
  }, [mutate]);
  const handleFocusStatusChange = useCallback((taskId: string, newStatus: string) => {
    mutate(
      async (currentData: DashboardTask[] | undefined) => {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error('Failed to update task');
        return (Array.isArray(currentData) ? currentData : []).map((t) =>
          t.id === taskId ? { ...t, status: newStatus as DashboardTask['status'] } : t
        );
      },
      {
        optimisticData: (currentData: DashboardTask[] | undefined) =>
          (Array.isArray(currentData) ? currentData : []).map((t) =>
            t.id === taskId ? { ...t, status: newStatus as DashboardTask['status'] } : t
          ),
        rollbackOnError: true,
        revalidate: false,
      }
    ).catch(() => {
      toast.error('Failed to update task');
    });
  }, [mutate, toast]);

  const toggleAimStatus = useCallback((aimId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED';
    mutateAims(
      async (currentData: DashboardAimInstance[] | undefined) => {
        await fetch(`/api/aims/instances/${aimId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        return (Array.isArray(currentData) ? currentData : []).map((a) =>
          a.id === aimId ? { ...a, status: newStatus } : a
        );
      },
      {
        optimisticData: (currentData: DashboardAimInstance[] | undefined) =>
          (Array.isArray(currentData) ? currentData : []).map((a) =>
            a.id === aimId ? { ...a, status: newStatus } : a
          ),
        rollbackOnError: true,
      }
    );
  }, [mutateAims]);

  const handleBlockMove = useCallback((blockId: string, type: string, newStart: Date, newEnd: Date) => {
    // External calendar events, meetings, and reviews are read-only
    if (type === 'GOOGLE_CAL' || type === 'MEETING' || type === 'REVIEW') return;

    const startISO = newStart.toISOString();
    const endISO = newEnd.toISOString();
    const payload = { timeBlockStart: startISO, timeBlockEnd: endISO };

    if (type === 'POWER_DOWN') {
      const dateStr = getLocalDateString(newStart);
      fetch('/api/powerdown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionDate: dateStr, timeBlockStart: startISO, timeBlockEnd: endISO }),
      }).then(() => mutatePowerdown());
      return;
    }

    if (type === 'AIM') {
      mutateAims(
        async (currentData: DashboardAimInstance[] | undefined) => {
          await fetch(`/api/aims/instances/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return (Array.isArray(currentData) ? currentData : []).map((a) =>
            a.id === blockId ? { ...a, ...payload } : a
          );
        },
        {
          optimisticData: (currentData: DashboardAimInstance[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((a) =>
              a.id === blockId ? { ...a, ...payload } : a
            ),
          rollbackOnError: true,
        }
      );
    } else {
      mutate(
        async (currentData: DashboardTask[] | undefined) => {
          await fetch(`/api/tasks/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return (Array.isArray(currentData) ? currentData : []).map((t) =>
            t.id === blockId ? { ...t, ...payload } : t
          );
        },
        {
          optimisticData: (currentData: DashboardTask[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((t) =>
              t.id === blockId ? { ...t, ...payload } : t
            ),
          rollbackOnError: true,
        }
      );
    }
  }, [mutate, mutateAims, mutatePowerdown]);

  const handleTaskClick = useCallback((t: DashboardTask) => {
    if (t.taskType === 'REVIEW') {
      router.push('/reviews');
      return;
    }
    setExpandedTaskId((prev) => (prev === t.id ? null : t.id));
  }, [router]);

  const handleTaskToggle = useCallback((t: DashboardTask) => {
    const newStatus = t.status === 'DONE' ? 'TODO' : 'DONE';
    handleFocusStatusChange(t.id, newStatus);
    if (newStatus === 'DONE') {
      // Play completion sound
      try { new Audio('/sounds/complete.wav').play(); } catch {}
      // Fire confetti
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#818cf8', '#22d3ee', '#10b981', '#f59e0b'] });
      });
    }
  }, [handleFocusStatusChange]);

  const isLoading = sessionStatus === 'loading' || tasksLoading;
  const userName = session?.user?.name?.split(' ')[0] || (sessionStatus === 'loading' ? '...' : 'there');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const scheduledCount = timelineBlocks.length;

  return (
    <div>
      {/* Top bar: Focus mode + view toggle */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('daily')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'daily' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'weekly' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Weekly
          </button>
        </div>
        <button
          onClick={toggleFocusMode}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            focusMode
              ? 'bg-indigo-600 text-white border border-indigo-600'
              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-white/[0.1]'
          }`}
        >
          <Focus className="h-3.5 w-3.5" />
          {focusMode ? 'Full View' : 'Focus Mode'}
        </button>
      </div>

      {/* Derailing aims alert */}
      {derailBatch && <DerailAlertBanner derailBatch={derailBatch} />}

      {focusMode ? (
        <>
          <WinTheDayCard tasks={winTheDayTasks} />
          <WinTheDayCelebration show={showWinCelebration} onComplete={() => setShowWinCelebration(false)} />
          <div className="mt-4">
            <FocusView tasks={list} onStatusChange={handleFocusStatusChange} />
          </div>
        </>
      ) : viewMode === 'weekly' ? (
        <>
          {/* Weekly View */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">{greeting}, {userName}</h1>
                {dailyStreak && dailyStreak.currentCount > 0 && (
                  <Link href="/streaks" className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 text-sm font-medium hover:bg-yellow-400/25 transition-colors">
                    <Flame className="h-3.5 w-3.5" />
                    {dailyStreak.currentCount}
                  </Link>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(today, { weekday: true })}</p>
              <p className="text-sm text-[var(--text-muted)]">
                Week of {new Date(weekRange.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(weekRange.end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
            <QuickAddMenu />
          </div>
          <div className="space-y-6">
            {Object.entries(weeklyGrouped).sort(([a], [b]) => a.localeCompare(b)).map(([dateKey, dayTasks]) => {
              const isToday = dateKey === today;
              const dayLabel = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
              return (
                <div key={dateKey}>
                  <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${isToday ? 'text-indigo-400' : 'text-[var(--text-secondary)]'}`}>
                    <span>{dayLabel}</span>
                    {isToday && (
                      <span className="rounded bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400 border border-indigo-600/30">Today</span>
                    )}
                    <span className="text-xs text-[var(--text-muted)]">({dayTasks.length})</span>
                  </div>
                  {dayTasks.length === 0 && aimList.filter((a: any) => toLocalDateKey(a.scheduledDate) === dateKey).length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] ml-1">No tasks or AIMs</p>
                  ) : (
                    <div className="space-y-2">
                      {dayTasks.map((task: any) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onToggle={handleTaskToggle}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onClick={handleTaskClick}
                          onStatusChange={handleFocusStatusChange}
                        />
                      ))}
                      {aimList
                        .filter((a: any) => toLocalDateKey(a.scheduledDate) === dateKey)
                        .map((aim: any) => (
                          <div key={aim.id} className="glass-panel p-3 flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={aim.status === 'COMPLETED'}
                              onChange={() => toggleAimStatus(aim.id, aim.status)}
                              className="h-5 w-5 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-teal-400 text-xs">💪</span>
                            <span className={`text-sm font-medium flex-1 ${aim.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
                              {aim.aimCategory?.name ?? 'AIM'}{aim.selectedActivity ? ` — ${aim.selectedActivity}` : ''}
                            </span>
                            {aim.timeBlockStart && aim.timeBlockEnd && (
                              <span className="text-xs rounded px-2 py-0.5 bg-teal-500/15 text-teal-400">
                                {new Date(aim.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                                {new Date(aim.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Greeting bar */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">{greeting}, {userName}</h1>
                {dailyStreak && dailyStreak.currentCount > 0 && (
                  <Link href="/streaks" className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 text-sm font-medium hover:bg-yellow-400/25 transition-colors">
                    <Flame className="h-3.5 w-3.5" />
                    {dailyStreak.currentCount}
                  </Link>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(today, { weekday: true })}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {isLoading ? 'Loading...' : `${scheduledCount} item${scheduledCount !== 1 ? 's' : ''} scheduled today`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <QuickAddMenu />
              <Link
                href="/ideas"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
              >
                <Lightbulb className="h-4 w-4" />
                Add Idea
              </Link>
            </div>
          </div>

          {/* Timeline */}
          <DashboardTimeline blocks={timelineBlocks} className="mb-6" onBlockMove={handleBlockMove} />

          {/* Today's Work Blocks */}
          <TodayWorkBlocks />

          {/* Win the Day */}
          <WinTheDayCard tasks={winTheDayTasks} />
          <WinTheDayCelebration show={showWinCelebration} onComplete={() => setShowWinCelebration(false)} />

          {/* Grouped task checklists */}
          <div className="space-y-6 mb-6">
            {doneTotalDashboard > 0 && (
              <button
                onClick={() => setShowDoneTasks((v) => !v)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showDoneTasks ? `Hide completed (${doneTotalDashboard})` : `Show completed (${doneTotalDashboard})`}
              </button>
            )}
            {Object.entries(groupedTasks).map(([type, typeTasks]) => {
              const colorKey = type as keyof typeof PRISM_COLORS;
              const colors = PRISM_COLORS[colorKey];
              if (!colors) return null;

              return (
                <div key={type}>
                  <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${colors.textClass}`}>
                    <span>{colors.emoji}</span> {colors.label} Tasks
                    <span className="text-xs text-[var(--text-muted)] font-normal">({typeTasks.length})</span>
                  </h3>
                  {typeTasks.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] ml-6">No {colors.label.toLowerCase()} tasks</p>
                  ) : (
                    <div className="space-y-2">
                      {typeTasks.map((task: any) => (
                        <div key={task.id}>
                          <TaskCard
                            task={task}
                            onToggle={handleTaskToggle}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onClick={handleTaskClick}
                            onStatusChange={handleFocusStatusChange}
                            onWinTheDayToggle={handleWinTheDayToggle}
                            hideClearGoals={expandedTaskId === task.id}
                          />
                          {expandedTaskId === task.id && (
                            <div className="ml-8 mt-1 mb-2 space-y-2">
                              <SubtaskList parentId={task.id} initialChildren={task.children} compact onMutate={() => mutate()} />
                              <ClearGoalsDisplay taskId={task.id} editable collapsible defaultExpanded />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AIMs today */}
          <div className="mb-6">
            <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${PRISM_COLORS.AIM.textClass}`}>
              <span>{PRISM_COLORS.AIM.emoji}</span> AIMs Today
              <span className="text-xs text-[var(--text-muted)] font-normal">({aimList.length})</span>
            </h3>
            {aimList.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] ml-6">No AIMs scheduled</p>
            ) : (
              <div className="space-y-2">
                {aimList.map((aim: any) => {
                  const isDerailing = derailBatch?.[aim.aimCategoryId]?.derailInfo?.status === 'derailing';
                  const completedCount = derailBatch?.[aim.aimCategoryId]?.history?.filter((h) => h.completed).length ?? 0;
                  const isCompleted = aim.status === 'COMPLETED';
                  return (
                    <div
                      key={aim.id}
                      className={`glass-panel px-4 py-3 flex items-center gap-3 hover:border-[var(--glass-border)] transition-colors ${isDerailing ? 'border-red-500/30' : ''}`}
                    >
                      <button
                        onClick={() => toggleAimStatus(aim.id, aim.status)}
                        className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
                          isCompleted
                            ? 'bg-green-600 border-green-600'
                            : 'border-[var(--border-color)] hover:border-teal-500'
                        }`}
                      >
                        {isCompleted && (
                          <svg
                            className="h-full w-full text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium truncate ${isCompleted ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                          {aim.aimCategory?.name ?? 'AIM'}
                          {aim.selectedActivity && ` — ${aim.selectedActivity}`}
                        </span>
                        <div className="text-xs text-[var(--text-muted)]">
                          {isDerailing ? (
                            <span className="text-red-400">Derailing</span>
                          ) : completedCount > 0 ? (
                            <span>{completedCount} completed (14d)</span>
                          ) : null}
                        </div>
                      </div>
                      {aim.timeBlockStart && aim.timeBlockEnd && (
                        <span className={`text-xs rounded px-2 py-0.5 ${PRISM_COLORS.AIM.bgClass} ${PRISM_COLORS.AIM.textClass}`}>
                          {new Date(aim.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                          {new Date(aim.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Review due banner — mirrors the tasks-page pattern */}
          <ReviewDueBanner reviews={reviewsDue} />

          {/* Unscheduled Tasks */}
          {unscheduledList.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setShowUnscheduled(!showUnscheduled)}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)] mb-2 hover:text-[var(--text-secondary)] transition-colors"
              >
                <Inbox className="h-4 w-4" />
                Unscheduled ({unscheduledList.length})
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showUnscheduled ? 'rotate-180' : ''}`} />
              </button>
              {showUnscheduled && (
                <div className="space-y-2 border-l-2 border-dashed border-[var(--border-color)] pl-4">
                  {unscheduledList.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleTaskToggle}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onClick={handleTaskClick}
                      onWinTheDayToggle={handleWinTheDayToggle}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Power Down reminder */}
          <Link
            href="/powerdown"
            className={`flex items-center gap-3 glass-panel p-3 transition-colors ${powerdownSession?.completedAt ? 'border-green-500/30 hover:border-green-500/50' : 'border-violet-500/20 hover:border-violet-500/40'}`}
          >
            {powerdownSession?.completedAt ? (
              <Check className="h-5 w-5 text-green-400" />
            ) : (
              <Moon className="h-5 w-5 text-violet-400" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${powerdownSession?.completedAt ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>Power Down</p>
              <p className="text-xs text-[var(--text-muted)]">
                {powerdownSession?.completedAt
                  ? `Completed at ${new Date(powerdownSession.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : "Prepare tomorrow's plan & close out today"}
              </p>
            </div>
            {powerdownSession?.completedAt ? (
              <span className="text-xs text-green-400 bg-green-500/15 rounded-lg px-3 py-1">Done</span>
            ) : (
              <span className="text-xs text-white bg-violet-600 rounded-lg px-3 py-1">Start</span>
            )}
          </Link>
        </>
      )}

      {editingTask && (
        <TaskEditor
          task={editingTask === 'new' ? undefined : editingTask}
          onSave={refresh}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ---- Derail Alert Banner ----

function DerailAlertBanner({ derailBatch }: { derailBatch: DerailBatchResponse }) {
  const needsAttention = Object.values(derailBatch)
    .map((entry) => entry.derailInfo)
    .filter((d) => d.status === 'caution' || d.status === 'derailing');

  if (needsAttention.length === 0) return null;

  const derailingCount = needsAttention.filter((d) => d.status === 'derailing').length;
  const cautionCount = needsAttention.filter((d) => d.status === 'caution').length;
  const parts: string[] = [];
  if (derailingCount > 0) parts.push(`${derailingCount} derailing`);
  if (cautionCount > 0) parts.push(`${cautionCount} needs caution`);

  return (
    <Link
      href="/aims"
      className="mb-4 flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-2.5 text-sm text-red-400 hover:bg-red-600/20 transition-colors"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {needsAttention.length} aim{needsAttention.length !== 1 ? 's' : ''} need{needsAttention.length === 1 ? 's' : ''} attention
        {parts.length > 0 && <span className="text-red-500/70"> ({parts.join(', ')})</span>}
      </span>
    </Link>
  );
}
