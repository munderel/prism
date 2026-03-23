'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskCard } from './TaskCard';

const SECTIONS = [
  { key: 'GOAL_STACK', label: 'Goal Stack', color: 'text-indigo-400' },
  { key: 'REACT', label: 'React', color: 'text-yellow-400' },
  { key: 'MAINTENANCE', label: 'Maintenance', color: 'text-cyan-400' },
] as const;

interface DailyTaskListProps {
  date: string; // YYYY-MM-DD
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onStatusChange?: () => void;
}

export function DailyTaskList({ date, onEdit, onDelete, onClick, onStatusChange }: DailyTaskListProps) {
  const { data, isLoading, mutate } = useSWR(`/api/tasks?date=${date}&includeUnscheduled=true`);
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

  const grouped = useMemo(() => SECTIONS.map(({ key, label, color }) => ({
    key,
    label,
    color,
    tasks: tasks.filter((t: any) => t.taskType === key),
  })), [tasks]);

  if (isLoading) {
    return <div className="text-gray-500 text-sm py-4">Loading tasks...</div>;
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
              <ChevronRight className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
            <span className={`text-sm font-semibold ${color}`}>{label}</span>
            <span className="text-xs text-gray-600">({sectionTasks.length})</span>
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
                  <p className="text-xs text-gray-600 pl-6">No tasks</p>
                ) : (
                  sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onClick={onClick}
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
