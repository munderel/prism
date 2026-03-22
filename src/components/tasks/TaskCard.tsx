'use client';

import { motion } from 'framer-motion';
import { Pencil, Trash2, MessageSquare, RefreshCw, Target } from 'lucide-react';

const priorityDot: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-gray-500',
};

const statusBadge: Record<string, string> = {
  TODO: 'text-gray-400',
  IN_PROGRESS: 'text-yellow-400',
  DONE: 'text-green-400',
  DROPPED: 'text-red-400',
};

interface TaskCardProps {
  task: any;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
}

export function TaskCard({ task, onToggle, onEdit, onDelete, onClick }: TaskCardProps) {
  const isDone = task.status === 'DONE';
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group"
    >
      <div
        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 hover:border-gray-700 transition-colors cursor-pointer"
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
            <motion.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-full w-full text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path d="M5 13l4 4L19 7" />
            </motion.svg>
          )}
        </button>

        {/* Priority dot */}
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDot[task.priority] ?? priorityDot.MEDIUM}`} />

        {/* Title and meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
              {task.title}
            </span>
            <span className={`text-xs ${statusBadge[task.status] ?? ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
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
    </motion.div>
  );
}
