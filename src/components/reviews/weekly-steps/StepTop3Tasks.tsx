'use client';

import { useState, useEffect } from 'react';
import { ListTodo } from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';
import { TopNTaskSelector } from '../shared/TopNTaskSelector';

interface Task {
  id: string;
  title: string;
  taskType?: string;
  priority?: string;
  status: string;
  dueDate: string | null;
  goal?: { id: string; title: string } | null;
}

interface StepTop3TasksProps {
  reviewId: string;
  selectedTaskIds: string[];
  onSelectionChange: (taskIds: string[]) => void;
  onTaskCountChange?: (count: number) => void;
  isTeamReview?: boolean;
}

export function StepTop3Tasks({ reviewId: _reviewId, selectedTaskIds, onSelectionChange, onTaskCountChange, isTeamReview }: StepTop3TasksProps) {
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

      const scopeParam = isTeamReview ? '&scope=company' : '';
      const res = await fetch(
        `/api/tasks?startDate=${getLocalDateString(startDate)}&endDate=${getLocalDateString(endDate)}&status=TODO&includeUnscheduled=true${scopeParam}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter((t: Task) => t.status !== 'DONE' && t.status !== 'DROPPED');
        setTasks(filtered);
        onTaskCountChange?.(filtered.length);
      } else {
        onTaskCountChange?.(0);
      }
    } catch (err) {
      console.error('Failed to fetch upcoming tasks:', err);
      onTaskCountChange?.(0);
    }
    setLoading(false);
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
    <TopNTaskSelector
      tasks={tasks.map((t: Task) => ({ id: t.id, title: t.title, taskType: t.taskType, priority: t.priority }))}
      n={3}
      selectedIds={selectedTaskIds}
      onSelect={onSelectionChange}
      label="Select your top 3 most important tasks for this week"
    />
  );
}
