'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Focus, AlertTriangle, Lightbulb, Moon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getLocalDateString, toLocalDateKey, formatDisplayDate } from '@/lib/date-utils';
import { useToast } from '@/components/ui/ToastProvider';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { ClearGoalsDisplay } from '@/components/tasks/ClearGoalsDisplay';
import { WinTheDayCard } from '@/components/dashboard/WinTheDayCard';
import { WinTheDayCelebration } from '@/components/dopamine/WinTheDayCelebration';
import { FocusView } from '@/components/dashboard/FocusView';
import { DashboardTimeline } from '@/components/dashboard/DashboardTimeline';
import { QuickAddMenu } from '@/components/dashboard/QuickAddMenu';
import { WeeklyHourTarget } from '@/components/calendar/WeeklyHourTarget';
import { PRISM_COLORS } from '@/lib/prism-colors';
import type { DerailInfo } from '@/lib/derail-detection';

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
  _count?: { comments: number };
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

export default function DashboardPage() {
  const toast = useToast();
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
    : `/api/tasks?date=${today}&includeUnscheduled=true`;
  const { data: tasks, mutate, isLoading: tasksLoading } = useSWR<DashboardTask[]>(taskKey, { revalidateOnFocus: true });
  const list: DashboardTask[] = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);

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

    return blocks;
  }, [list, aimList]);

  // Calculate weekly scheduled hours
  const weeklyScheduledHours = useMemo(() => {
    let totalMinutes = 0;
    for (const block of timelineBlocks) {
      const start = new Date(block.start);
      const end = new Date(block.end);
      totalMinutes += (end.getTime() - start.getTime()) / 60000;
    }
    return Math.round((totalMinutes / 60) * 10) / 10;
  }, [timelineBlocks]);

  // Win the Day: top 3 ranked tasks from power-down
  const winTheDayTasks = useMemo(() => {
    const wtdTasks = list.filter((t) => t.isWinTheDay);
    // Sort by priority: URGENT > HIGH > MEDIUM > LOW
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    wtdTasks.sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));
    return wtdTasks.slice(0, 3).map((t, i) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      rank: i + 1,
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
    const groups: Record<string, DashboardTask[]> = {
      IMPROVE: [],
      REACT: [],
      MAINTENANCE: [],
      REVIEW: [],
    };
    for (const t of list) {
      const type = t.taskType || 'IMPROVE';
      if (groups[type]) {
        groups[type].push(t);
      } else {
        groups.IMPROVE.push(t);
      }
    }
    return groups;
  }, [list]);

  const refresh = useCallback(() => {
    mutate();
    setEditingTask(null);
  }, [mutate]);

  const handleEdit = useCallback((task: DashboardTask) => setEditingTask(task), []);
  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
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
      }
    ).catch(() => {
      toast.error('Failed to update task');
    });
  }, [mutate, toast]);

  const handleBlockMove = useCallback((blockId: string, type: string, newStart: Date, newEnd: Date) => {
    const startISO = newStart.toISOString();
    const endISO = newEnd.toISOString();

    if (type === 'AIM') {
      mutateAims(
        async (currentData: DashboardAimInstance[] | undefined) => {
          await fetch(`/api/aims/instances/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
          return (Array.isArray(currentData) ? currentData : []).map((a) =>
            a.id === blockId ? { ...a, timeBlockStart: startISO, timeBlockEnd: endISO } : a
          );
        },
        {
          optimisticData: (currentData: DashboardAimInstance[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((a) =>
              a.id === blockId ? { ...a, timeBlockStart: startISO, timeBlockEnd: endISO } : a
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
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
          return (Array.isArray(currentData) ? currentData : []).map((t) =>
            t.id === blockId ? { ...t, timeBlockStart: startISO, timeBlockEnd: endISO } : t
          );
        },
        {
          optimisticData: (currentData: DashboardTask[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((t) =>
              t.id === blockId ? { ...t, timeBlockStart: startISO, timeBlockEnd: endISO } : t
            ),
          rollbackOnError: true,
        }
      );
    }
  }, [mutate, mutateAims]);

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
              viewMode === 'daily' ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'weekly' ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Weekly
          </button>
        </div>
        <button
          onClick={toggleFocusMode}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            focusMode
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
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
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{greeting}, {userName}</h1>
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
                          onToggle={(t: any) => handleFocusStatusChange(t.id, t.status === 'DONE' ? 'TODO' : 'DONE')}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onClick={(t: any) => setExpandedTaskId(expandedTaskId === t.id ? null : t.id)}
                          onStatusChange={handleFocusStatusChange}
                        />
                      ))}
                      {/* AIMs for this day */}
                      {aimList
                        .filter((a: any) => toLocalDateKey(a.scheduledDate) === dateKey)
                        .map((aim: any) => (
                          <div key={aim.id} className="glass-panel p-3 flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={aim.status === 'COMPLETED'}
                              onChange={() => {
                                const newStatus = aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED';
                                mutateAims(
                                  async (currentData: DashboardAimInstance[] | undefined) => {
                                    await fetch(`/api/aims/instances/${aim.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ status: newStatus }),
                                    });
                                    return (Array.isArray(currentData) ? currentData : []).map((a) =>
                                      a.id === aim.id ? { ...a, status: newStatus } : a
                                    );
                                  },
                                  {
                                    optimisticData: (currentData: DashboardAimInstance[] | undefined) =>
                                      (Array.isArray(currentData) ? currentData : []).map((a) =>
                                        a.id === aim.id ? { ...a, status: newStatus } : a
                                      ),
                                    rollbackOnError: true,
                                  }
                                );
                              }}
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
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{greeting}, {userName}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{formatDisplayDate(today, { weekday: true })}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {isLoading ? 'Loading...' : `${scheduledCount} item${scheduledCount !== 1 ? 's' : ''} scheduled today · ${weeklyScheduledHours}h scheduled`}
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

          {/* Weekly hour target */}
          <div className="mb-6">
            <WeeklyHourTarget scheduledHours={weeklyScheduledHours} />
          </div>

          {/* Win the Day */}
          <WinTheDayCard tasks={winTheDayTasks} />
          <WinTheDayCelebration show={showWinCelebration} onComplete={() => setShowWinCelebration(false)} />

          {/* Grouped task checklists */}
          <div className="space-y-6 mb-6">
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
                            onToggle={(t: any) => handleFocusStatusChange(t.id, t.status === 'DONE' ? 'TODO' : 'DONE')}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onClick={(t: any) => setExpandedTaskId(expandedTaskId === t.id ? null : t.id)}
                            onStatusChange={handleFocusStatusChange}
                          />
                          {expandedTaskId === task.id && (
                            <div className="ml-8 mt-1 mb-2">
                              <ClearGoalsDisplay taskId={task.id} compact />
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
                        onClick={async () => {
                          const newStatus = isCompleted ? 'SCHEDULED' : 'COMPLETED';
                          mutateAims(
                            async (currentData: any) => {
                              await fetch(`/api/aims/instances/${aim.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: newStatus }),
                              });
                              return (Array.isArray(currentData) ? currentData : []).map((a: any) =>
                                a.id === aim.id ? { ...a, status: newStatus } : a
                              );
                            },
                            {
                              optimisticData: (currentData: any) =>
                                (Array.isArray(currentData) ? currentData : []).map((a: any) =>
                                  a.id === aim.id ? { ...a, status: newStatus } : a
                                ),
                              rollbackOnError: true,
                            }
                          );
                        }}
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

          {/* Power Down reminder */}
          <Link
            href="/powerdown"
            className="flex items-center gap-3 glass-panel p-3 border-violet-500/20 hover:border-violet-500/40 transition-colors"
          >
            <Moon className="h-5 w-5 text-violet-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Power Down</p>
              <p className="text-xs text-[var(--text-muted)]">Prepare tomorrow&apos;s plan & close out today</p>
            </div>
            <span className="text-xs text-violet-400 bg-violet-500/15 rounded-lg px-3 py-1">Start</span>
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

  return (
    <Link
      href="/aims"
      className="mb-4 flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-2.5 text-sm text-red-400 hover:bg-red-600/20 transition-colors"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {needsAttention.length} aim{needsAttention.length !== 1 ? 's' : ''} need{needsAttention.length === 1 ? 's' : ''} attention
        {(() => {
          const derailingCount = needsAttention.filter((d) => d.status === 'derailing').length;
          const cautionCount = needsAttention.filter((d) => d.status === 'caution').length;
          const parts: string[] = [];
          if (derailingCount > 0) parts.push(`${derailingCount} derailing`);
          if (cautionCount > 0) parts.push(`${cautionCount} needs caution`);
          return parts.length > 0 ? <span className="text-red-500/70"> ({parts.join(', ')})</span> : null;
        })()}
      </span>
    </Link>
  );
}
