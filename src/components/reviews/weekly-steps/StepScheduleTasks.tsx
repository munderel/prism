'use client';

import { useState, useEffect } from 'react';
import { CalendarClock, ListTodo, Brain, Target, ListChecks } from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';
import { subtaskDoneCount } from '@/lib/task-utils';
import { getPriorityBadgeClass } from '../shared/review-types';

interface SubtaskSummary {
  id: string;
  title: string;
  status: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  goal?: { id: string; title: string } | null;
  children?: SubtaskSummary[];
  _count?: { children: number };
}

interface WorkBlock {
  id: string;
  name: string;
  type: 'deep_work' | 'normal' | 'aim';
  durationMinutes: number;
  preferredTime: string;
}

interface StepScheduleTasksProps {
  reviewId: string;
  mitTaskId: string | null;
  workBlocks: WorkBlock[];
  initialAssignments?: Record<string, string>;
  onAssignmentsChange: (assignments: Record<string, string>) => void;
}

export function StepScheduleTasks({
  reviewId: _reviewId,
  mitTaskId,
  workBlocks,
  initialAssignments,
  onAssignmentsChange,
}: StepScheduleTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments ?? {});

  useEffect(() => {
    fetchRemainingTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mitTaskId]);

  useEffect(() => {
    if (initialAssignments) setAssignments(initialAssignments);
  }, [initialAssignments]);

  const fetchRemainingTasks = async () => {
    try {
      const now = new Date();
      const startDate = new Date(now);
      const dow = now.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      startDate.setDate(now.getDate() + mondayOffset);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 13);
      endDate.setHours(23, 59, 59, 999);

      const res = await fetch(
        `/api/tasks?startDate=${getLocalDateString(startDate)}&endDate=${getLocalDateString(endDate)}&status=TODO&includeUnscheduled=true`
      );
      if (res.ok) {
        const data: Task[] = await res.json();
        // Exclude the MIT and completed/dropped tasks
        const filtered = data.filter(
          (t: any) => t.id !== mitTaskId && t.status !== 'DONE' && t.status !== 'DROPPED'
        );
        setTasks(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch tasks for scheduling:', err);
    }
    setLoading(false);
  };

  const assignTaskToBlock = (taskId: string, blockId: string) => {
    const updated = { ...assignments };
    if (updated[taskId] === blockId) {
      delete updated[taskId];
    } else {
      updated[taskId] = blockId;
    }
    setAssignments(updated);
    onAssignmentsChange(updated);
  };

  const getBlockColor = (type: string) => {
    switch (type) {
      case 'deep_work': return 'border-purple-500/30 bg-purple-500/10 text-purple-400';
      case 'normal': return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
      case 'aim': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
      default: return 'border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--text-muted)]';
    }
  };

  const getBlockIcon = (type: string) => {
    switch (type) {
      case 'deep_work': return Brain;
      case 'aim': return Target;
      default: return ListTodo;
    }
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>;
  }

  if (workBlocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <CalendarClock className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No work blocks created yet.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Go back to the &quot;Plan Work Blocks&quot; step to create blocks first.
        </p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <ListTodo className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No additional tasks to schedule.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          All tasks are either your MIT or already completed.
        </p>
      </div>
    );
  }

  const assignedCount = Object.keys(assignments).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <CalendarClock className="h-4 w-4 text-indigo-400" />
          <p className="text-sm">Assign your remaining tasks to work blocks.</p>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {assignedCount}/{tasks.length} assigned
        </span>
      </div>

      {/* Work blocks summary */}
      <div className="flex flex-wrap gap-2">
        {workBlocks.map((block) => {
          const tasksInBlock = Object.entries(assignments).filter(([, bId]) => bId === block.id).length;
          const Icon = getBlockIcon(block.type);
          return (
            <div
              key={block.id}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${getBlockColor(block.type)}`}
            >
              <Icon className="h-3 w-3" />
              <span className="font-medium">{block.name}</span>
              <span className="opacity-70">({tasksInBlock})</span>
            </div>
          );
        })}
      </div>

      {/* Task list with block assignment */}
      <div className="space-y-2">
        {tasks.map((task) => {
          const assignedBlockId = assignments[task.id];

          return (
            <div
              key={task.id}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3 space-y-2"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-[var(--text-primary)] truncate">{task.title}</p>
                    {(task._count?.children ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-[var(--text-muted)]" title={`${subtaskDoneCount(task.children)}/${task._count!.children} subtasks`}>
                        <ListChecks className="h-3 w-3" />
                        {subtaskDoneCount(task.children)}/{task._count!.children}
                      </span>
                    )}
                  </div>
                  {task.goal && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {task.goal.title}
                    </p>
                  )}
                  {task.children && task.children.length > 0 && (
                    <div className="mt-1 ml-2 space-y-0.5">
                      {task.children.map((child) => (
                        <p key={child.id} className={`text-xs ${child.status === 'DONE' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
                          {child.status === 'DONE' ? '\u2713' : '\u25CB'} {child.title}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getPriorityBadgeClass(task.priority)}`}>
                  {task.priority}
                </span>
              </div>

              {/* Block assignment buttons */}
              <div className="flex flex-wrap gap-1.5">
                {workBlocks.map((block) => {
                  const isAssigned = assignedBlockId === block.id;
                  const Icon = getBlockIcon(block.type);
                  return (
                    <button
                      key={block.id}
                      onClick={() => assignTaskToBlock(task.id, block.id)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                        isAssigned
                          ? getBlockColor(block.type) + ' font-medium'
                          : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-indigo-500/30'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {block.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
