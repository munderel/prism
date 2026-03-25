'use client';

import React from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2, MessageSquare, RefreshCw, Target } from 'lucide-react';
import { PRIORITY_DOT_COLORS, TASK_STATUS_COLORS } from '@/lib/goal-constants';

interface TaskCardProps {
  task: any;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
}

export const TaskCard = React.memo(function TaskCard({ task, onToggle, onEdit, onDelete, onClick }: TaskCardProps) {
  const isDone = task.status === 'DONE';
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group"
    >
      <div
        className="flex items-center gap-3 glass-panel px-4 py-3 hover:border-gray-700 transition-colors cursor-pointer"
        onClick={() => onClick?.(task)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
            isDone
              ? 'bg-green-600 border-green-600'
              : 'border-gray-600 hover:border-indigo-500'
          }`}
        >
          {isDone && (
            <m.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-full w-full text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path d="M5 13l4 4L19 7" />
            </m.svg>
          )}
        </button>

        {/* Priority dot */}
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT_COLORS[task.priority] ?? PRIORITY_DOT_COLORS.MEDIUM}`} />

        {/* Title and meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
              {task.title}
            </span>
            <span className={`text-xs ${TASK_STATUS_COLORS[task.status] ?? ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
          {task.goal?.stack?.name && (
            <span className="text-xs text-gray-500">{task.goal.stack.name}</span>
          )}
          {task.taskType === 'MAINTENANCE' && task.processExecution?.process?.title && (
            <span className="text-xs text-orange-400/70">⚙ {task.processExecution.process.title}</span>
          )}
          {task.deliverable && (
            <p className="text-xs text-cyan-400/70 mt-1 truncate">→ {task.deliverable}</p>
          )}
        </div>

        {/* Icons */}
        <div className="flex items-center gap-2">
          {task.goal && (
            <span title={task.goal.title}>
              <Target className="h-3.5 w-3.5 text-indigo-400" />
            </span>
          )}
          {task.recurrenceRule && (
            <span title="Recurring">
              <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
            </span>
          )}
          {(task._count?.comments ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
              {task._count.comments}
            </span>
          )}
        </div>

        {/* Due date */}
        {task.dueDate && (
          <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}

        {/* Hover actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
            title="Edit task"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </m.div>
  );
});
