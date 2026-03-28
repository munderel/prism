'use client';

import { useState, useEffect } from 'react';
import { Star, ListTodo } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string;
  goal?: { id: string; title: string } | null;
}

interface StepTop3TasksProps {
  reviewId: string;
  selectedTaskIds: string[];
  onSelectionChange: (taskIds: string[]) => void;
}

export function StepTop3Tasks({ reviewId, selectedTaskIds, onSelectionChange }: StepTop3TasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUpcomingTasks();
  }, []);

  const fetchUpcomingTasks = async () => {
    try {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const res = await fetch(
        `/api/tasks?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}&status=TODO`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(data.filter((t: Task) => t.status !== 'DONE' && t.status !== 'DROPPED'));
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const selectTask = (taskId: string) => {
    if (selectedTaskIds.includes(taskId)) {
      // Deselect
      onSelectionChange([]);
    } else {
      // Select this one (deselect any previously selected)
      onSelectionChange([taskId]);
    }
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading upcoming tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <ListTodo className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No upcoming tasks found for this week.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Create tasks first, then come back to prioritize.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Star className="h-4 w-4 text-yellow-400" />
          <p className="text-sm">Choose the single most important task for this week.</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded ${
          selectedTaskIds.length === 1
            ? 'bg-green-500/20 text-green-400'
            : 'bg-[var(--surface-raised)] text-[var(--text-muted)]'
        }`}>
          {selectedTaskIds.length}/1 selected
        </span>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const isSelected = selectedTaskIds.includes(task.id);

          return (
            <button
              key={task.id}
              onClick={() => selectTask(task.id)}
              className={`flex items-center gap-3 w-full text-left rounded-lg border px-4 py-3 transition-all ${
                isSelected
                  ? 'border-yellow-500/50 bg-yellow-500/10'
                  : 'border-[var(--border-color)] bg-[var(--surface)] hover:border-yellow-500/30 hover:bg-yellow-500/5'
              }`}
            >
              <div className={`flex items-center justify-center h-6 w-6 rounded-full flex-shrink-0 text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-yellow-500 text-black'
                  : 'border border-[var(--border-color)] text-[var(--text-muted)]'
              }`}>
                {isSelected ? '1' : ''}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">{task.title}</p>
                {task.goal && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {task.goal.title}
                  </p>
                )}
              </div>

              <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                task.priority === 'URGENT' ? 'bg-red-500/20 text-red-400' :
                task.priority === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                task.priority === 'MEDIUM' ? 'bg-blue-500/20 text-blue-400' :
                'bg-[var(--surface-raised)] text-[var(--text-muted)]'
              }`}>
                {task.priority}
              </span>

              {isSelected && (
                <Star className="h-4 w-4 text-yellow-400 flex-shrink-0 fill-yellow-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
