'use client';

import React from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import { PRIORITY_DOT_COLORS, TASK_STATUS_COLORS } from '@/lib/goal-constants';

interface TaskCardInlineProps {
  task: any;
  depth: number;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
}

export const TaskCardInline = React.memo(function TaskCardInline({
  task,
  depth,
  onToggle,
  onEdit,
  onDelete,
}: TaskCardInlineProps) {
  const isDone = task.status === 'DONE';
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="group"
      style={{ paddingLeft: `${depth * 24}px` }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 hover:border-white/[0.08] transition-colors">
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          className={`flex-shrink-0 h-4 w-4 rounded border-2 transition-colors ${
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
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT_COLORS[task.priority] ?? PRIORITY_DOT_COLORS.MEDIUM}`} />

        {/* Title */}
        <span className={`flex-1 min-w-0 text-xs font-medium truncate ${isDone ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
          {task.title}
        </span>

        {/* Status */}
        <span className={`text-[10px] ${TASK_STATUS_COLORS[task.status] ?? ''}`}>
          {task.status.replace('_', ' ')}
        </span>

        {/* Due date */}
        {task.dueDate && (
          <span className={`text-[10px] shrink-0 ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            className="rounded p-0.5 text-gray-500 hover:bg-white/[0.05] hover:text-white"
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="rounded p-0.5 text-gray-500 hover:bg-white/[0.05] hover:text-red-400"
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </m.div>
  );
});
