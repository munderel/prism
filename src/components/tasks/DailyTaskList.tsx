'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { TaskCompletionKpiModal } from './TaskCompletionKpiModal';
import { useKpiCompletionPrompt } from '@/hooks/useKpiCompletionPrompt';

const SECTIONS = [
  { key: 'IMPROVE', label: 'Improve', color: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'REACT', label: 'React', color: 'text-amber-700 dark:text-yellow-400' },
  { key: 'MAINTENANCE', label: 'Maintenance', color: 'text-cyan-700 dark:text-cyan-400' },
  { key: 'REVIEW', label: 'Review', color: 'text-rose-600 dark:text-rose-400' },
] as const;

/** Task shape returned by the /api/tasks endpoint */
interface DailyTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  taskType: string;
  dueDate: string | null;
  goalId: string | null;
  isWinTheDay: boolean;
  isPinned: boolean;
  estimatedMinutes: number;
  assigneeId: string | null;
  deliverable: string | null;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  recurrenceRule: string | null;
  processId: string | null;
  processExecution?: { process?: { title?: string } } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown; // allow additional API fields without breaking
}

interface DailyTaskListProps {
  date: string; // YYYY-MM-DD
  prefetchedTasks?: DailyTask[];
  onEdit: (task: DailyTask) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: DailyTask) => void;
  onStatusChange?: () => void;
}

export function DailyTaskList({ date, prefetchedTasks, onEdit, onDelete, onClick, onStatusChange }: DailyTaskListProps) {
  const router = useRouter();
  const swrKey = prefetchedTasks ? null : `/api/tasks?date=${date}&includeUnscheduled=true`;
  const { data: swrData, isLoading, mutate } = useSWR(swrKey);
  const data = prefetchedTasks ?? swrData;
  const tasks = Array.isArray(data) ? data : [];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const { kpiPromptState, checkAndPrompt, dismiss } = useKpiCompletionPrompt();

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Shared optimistic mutation: patch a task and update local state
  const patchTask = useCallback(
    (taskId: string, patch: Record<string, unknown>, optimisticUpdate: (t: DailyTask) => DailyTask) => {
      mutate(
        async (currentData: DailyTask[] | undefined) => {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          onStatusChange?.();
          return (Array.isArray(currentData) ? currentData : []).map((t: DailyTask) =>
            t.id === taskId ? optimisticUpdate(t) : t
          );
        },
        {
          optimisticData: (currentData: DailyTask[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((t: DailyTask) =>
              t.id === taskId ? optimisticUpdate(t) : t
            ),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    },
    [mutate, onStatusChange]
  );

  const handleToggle = useCallback(
    (task: DailyTask) => {
      const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
      patchTask(task.id, { status: newStatus }, (t) => ({ ...t, status: newStatus }));
      if (newStatus === 'DONE') {

        checkAndPrompt(task);
      }
    },
    [patchTask, checkAndPrompt]
  );

  const handleWinTheDayToggle = useCallback(
    (task: DailyTask) => {
      const newValue = !task.isWinTheDay;
      // WTD toggle needs to unflag other tasks too
      mutate(
        async (currentData: DailyTask[] | undefined) => {
          await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isWinTheDay: newValue }),
          });
          onStatusChange?.();
          return (Array.isArray(currentData) ? currentData : []).map((t: DailyTask) => {
            if (t.id === task.id) return { ...t, isWinTheDay: newValue };
            if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
            return t;
          });
        },
        {
          optimisticData: (currentData: DailyTask[] | undefined) =>
            (Array.isArray(currentData) ? currentData : []).map((t: DailyTask) => {
              if (t.id === task.id) return { ...t, isWinTheDay: newValue };
              if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
              return t;
            }),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    },
    [mutate, onStatusChange]
  );

  const handleStatusChange = useCallback(
    (taskId: string, newStatus: string) => {
      patchTask(taskId, { status: newStatus }, (t) => ({ ...t, status: newStatus }));
      if (newStatus === 'DONE') {
        const task = tasks.find((t) => t.id === taskId);

        if (task) checkAndPrompt(task);
      }
    },
    [patchTask, tasks, checkAndPrompt]
  );

  const grouped = useMemo(() => SECTIONS.map(({ key, label, color }) => {
    const all = tasks.filter((t: DailyTask) => t.taskType === key);
    const active = all.filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED');
    const done = all.filter((t) => t.status === 'DONE' || t.status === 'DROPPED');
    return { key, label, color, tasks: showCompleted ? all : active, doneCount: done.length };
  }), [tasks, showCompleted]);

  if (isLoading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>;
  }

  const totalDone = grouped.reduce((sum, g) => sum + g.doneCount, 0);

  return (
    <>
    <div className="space-y-4">
      {totalDone > 0 && (
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {showCompleted ? `Hide completed (${totalDone})` : `Show completed (${totalDone})`}
        </button>
      )}
      {grouped.map(({ key, label, color, tasks: sectionTasks }) => (
        <div key={key}>
          <button
            onClick={() => toggleCollapse(key)}
            className="flex items-center gap-2 mb-2 w-full text-left"
          >
            {collapsed[key] ? (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            )}
            <span className={`text-sm font-semibold ${color}`}>{label}</span>
            <span className="text-xs text-[var(--text-muted)]">({sectionTasks.length})</span>
          </button>

          <AnimatePresence>
            {!collapsed[key] && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {sectionTasks.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] pl-6">No tasks</p>
                ) : (
                  sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onClick={(t: DailyTask) => { if (t.taskType === 'REVIEW') { router.push('/reviews'); return; } onClick?.(t); }}
                      onStatusChange={handleStatusChange}
                      onWinTheDayToggle={handleWinTheDayToggle}
                    />
                  ))
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
    {kpiPromptState && (
      <TaskCompletionKpiModal
        processId={kpiPromptState.processId}
        processTitle={kpiPromptState.processTitle}
        onClose={dismiss}
      />
    )}
    </>
  );
}
