'use client';

import { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { TaskCard } from './TaskCard';
import { TaskCompletionKpiModal } from './TaskCompletionKpiModal';
import { useKpiCompletionPrompt } from '@/hooks/useKpiCompletionPrompt';
import { playCompletionFeedback } from '@/lib/completion-feedback';

// REVIEW is intentionally omitted here: weekly/monthly/yearly reviews are
// Review rows (not Task rows) and surface via the pink banner on the Tasks
// page.
const SECTIONS = [
  { key: 'IMPROVE', label: 'Improve', color: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'REACT', label: 'React', color: 'text-amber-700 dark:text-yellow-400' },
  { key: 'MAINTENANCE', label: 'Maintenance', color: 'text-cyan-700 dark:text-cyan-400' },
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
  assignee?: { id: string; name: string | null; image: string | null } | null;
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
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (taskId: string) => void;
}

type Row =
  | { kind: 'header'; key: string; sectionKey: string; label: string; color: string; count: number; collapsed: boolean }
  | { kind: 'empty'; key: string }
  | { kind: 'task'; key: string; task: DailyTask }
  | { kind: 'completed-header'; key: string; count: number; expanded: boolean };

export function DailyTaskList({ date, prefetchedTasks, onEdit, onDelete, onClick, onStatusChange, selectionMode, selectedIds, onSelect }: DailyTaskListProps) {
  const router = useRouter();
  const swrKey = prefetchedTasks ? null : `/api/tasks?date=${date}`;
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
      patchTask(task.id, { status: newStatus }, (t) => ({
        ...t,
        status: newStatus,
        completedAt: newStatus === 'DONE' ? new Date().toISOString() : null,
      }));
      if (newStatus === 'DONE') {
        playCompletionFeedback();
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
    return { key, label, color, tasks: active };
  }), [tasks]);

  const completedTasks = useMemo(() =>
    tasks.filter((t: DailyTask) => t.status === 'DONE' || t.status === 'DROPPED'),
    [tasks]
  );

  // Flatten visible items into a single list so one virtualizer can drive
  // the whole component. Collapsed sections contribute only their header;
  // the completed section appends to the end.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const { key, label, color, tasks: sectionTasks } of grouped) {
      const isCollapsed = !!collapsed[key];
      out.push({ kind: 'header', key: `h-${key}`, sectionKey: key, label, color, count: sectionTasks.length, collapsed: isCollapsed });
      if (isCollapsed) continue;
      if (sectionTasks.length === 0) {
        out.push({ kind: 'empty', key: `e-${key}` });
      } else {
        for (const task of sectionTasks) {
          out.push({ kind: 'task', key: `${key}-${task.id}`, task });
        }
      }
    }
    if (completedTasks.length > 0) {
      out.push({ kind: 'completed-header', key: 'c-header', count: completedTasks.length, expanded: showCompleted });
      if (showCompleted) {
        for (const task of completedTasks) {
          out.push({ kind: 'task', key: `c-${task.id}`, task });
        }
      }
    }
    return out;
  }, [grouped, collapsed, completedTasks, showCompleted]);

  // Page-level scroll: scrollMargin tells the virtualizer how far down
  // the list begins so it can position items relative to window scroll.
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (parentRef.current) setScrollMargin(parentRef.current.offsetTop);
  }, [rows.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 80,
    overscan: 8,
    scrollMargin,
  });

  if (isLoading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>;
  }

  const handleTaskCardClick = (t: DailyTask) => {
    if (t.taskType === 'REVIEW') {
      router.push('/reviews');
      return;
    }
    onClick?.(t);
  };

  return (
    <>
      <div ref={parentRef}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={row.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
                }}
                className="pb-2"
              >
                {row.kind === 'header' && (
                  <button
                    onClick={() => toggleCollapse(row.sectionKey)}
                    className="flex items-center gap-2 mb-2 w-full text-left"
                  >
                    {row.collapsed ? (
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                    <span className={`text-sm font-semibold ${row.color}`}>{row.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">({row.count})</span>
                  </button>
                )}
                {row.kind === 'empty' && (
                  <p className="text-xs text-[var(--text-muted)] pl-6">No tasks</p>
                )}
                {row.kind === 'task' && (
                  <TaskCard
                    task={row.task}
                    onToggle={handleToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onClick={handleTaskCardClick}
                    onStatusChange={handleStatusChange}
                    onWinTheDayToggle={handleWinTheDayToggle}
                    isSelectable={selectionMode}
                    isSelected={selectedIds?.has(row.task.id)}
                    onSelect={onSelect}
                  />
                )}
                {row.kind === 'completed-header' && (
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex items-center gap-2 mb-2 w-full text-left"
                  >
                    {row.expanded ? (
                      <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                    <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Completed
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">({row.count})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
