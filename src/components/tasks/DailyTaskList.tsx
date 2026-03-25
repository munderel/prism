'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskCard } from './TaskCard';

const SECTIONS = [
  { key: 'IMPROVE', label: 'Improve', color: 'text-indigo-400' },
  { key: 'REACT', label: 'React', color: 'text-yellow-400' },
  { key: 'MAINTENANCE', label: 'Maintenance', color: 'text-cyan-400' },
] as const;

interface DailyTaskListProps {
  date: string; // YYYY-MM-DD
  prefetchedTasks?: any[];
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onStatusChange?: () => void;
}

export function DailyTaskList({ date, prefetchedTasks, onEdit, onDelete, onClick, onStatusChange }: DailyTaskListProps) {
  const swrKey = prefetchedTasks ? null : `/api/tasks?date=${date}&includeUnscheduled=true`;
  const { data: swrData, isLoading, mutate } = useSWR(swrKey);
  const data = prefetchedTasks ?? swrData;
  const tasks = Array.isArray(data) ? data : [];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggle = useCallback(async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    mutate(
      async (currentData: any) => {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const current = Array.isArray(currentData) ? currentData : [];
        return current.map((t: any) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        );
      },
      {
        optimisticData: (currentData: any) => {
          const current = Array.isArray(currentData) ? currentData : [];
          return current.map((t: any) =>
            t.id === task.id ? { ...t, status: newStatus } : t
          );
        },
        rollbackOnError: true,
      }
    );
    onStatusChange?.();
  }, [mutate, onStatusChange]);

  const handleWinTheDayToggle = useCallback(async (task: any) => {
    const newValue = !task.isWinTheDay;
    mutate(async (currentData: any) => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isWinTheDay: newValue }),
      });
      return (Array.isArray(currentData) ? currentData : []).map((t: any) => {
        if (t.id === task.id) return { ...t, isWinTheDay: newValue };
        if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
        return t;
      });
    }, { optimisticData: (currentData: any) => {
      return (Array.isArray(currentData) ? currentData : []).map((t: any) => {
        if (t.id === task.id) return { ...t, isWinTheDay: newValue };
        if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
        return t;
      });
    }, rollbackOnError: true });
    onStatusChange?.();
  }, [mutate, onStatusChange]);

  const handleStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    mutate(
      async (currentData: any) => {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const current = Array.isArray(currentData) ? currentData : [];
        return current.map((t: any) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        );
      },
      {
        optimisticData: (currentData: any) => {
          const current = Array.isArray(currentData) ? currentData : [];
          return current.map((t: any) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          );
        },
        rollbackOnError: true,
      }
    );
    onStatusChange?.();
  }, [mutate, onStatusChange]);

  const grouped = useMemo(() => SECTIONS.map(({ key, label, color }) => ({
    key,
    label,
    color,
    tasks: tasks.filter((t: any) => t.taskType === key),
  })), [tasks]);

  if (isLoading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
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
                      onClick={onClick}
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
  );
}
