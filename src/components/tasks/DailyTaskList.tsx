'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  refreshKey?: number;
}

export function DailyTaskList({ date, onEdit, onDelete, onClick, refreshKey }: DailyTaskListProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchTasks = async () => {
    setLoading(true);
    const res = await fetch(`/api/tasks?date=${date}`);
    if (res.ok) {
      setTasks(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshKey]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggle = async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTasks();
  };

  if (loading) {
    return <div className="text-gray-500 text-sm py-4">Loading tasks...</div>;
  }

  const grouped = SECTIONS.map(({ key, label, color }) => ({
    key,
    label,
    color,
    tasks: tasks.filter((t) => t.taskType === key),
  }));

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
              <motion.div
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
