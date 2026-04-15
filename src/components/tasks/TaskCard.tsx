'use client';

import React from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2, MessageSquare, RefreshCw, Target, Star, ListChecks } from 'lucide-react';
import { PRIORITY_DOT_COLORS } from '@/lib/goal-constants';
import { isTaskOverdue, subtaskDoneCount } from '@/lib/task-utils';
import { StatusChip } from './StatusChip';
import { ClearGoalsDisplay } from './ClearGoalsDisplay';

interface TaskCardProps {
  task: any;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onStatusChange?: (taskId: string, newStatus: string) => void;
  onWinTheDayToggle?: (task: any) => void;
  hideClearGoals?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelect?: (taskId: string) => void;
}

export const TaskCard = React.memo(function TaskCard({ task, onToggle, onEdit, onDelete, onClick, onStatusChange, onWinTheDayToggle, hideClearGoals, isSelectable, isSelected, onSelect }: TaskCardProps) {
  const isDone = task.status === 'DONE';
  const isOverdue = isTaskOverdue(task);

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group"
    >
      <div
        className={`flex items-center gap-3 glass-panel px-4 py-3 hover:border-[var(--glass-border)] transition-colors cursor-pointer ${isDone ? 'opacity-50' : ''} ${task.isWinTheDay ? 'border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : ''}`}
        onClick={() => onClick?.(task)}
      >
        {/* Selection checkbox (multi-select mode) */}
        {isSelectable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(task.id);
            }}
            className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
              isSelected
                ? 'bg-indigo-600 border-indigo-600'
                : 'border-[var(--border-color)] hover:border-indigo-500'
            }`}
          >
            {isSelected && (
              <svg viewBox="0 0 20 20" className="h-full w-full text-white">
                <path fill="currentColor" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </button>
        )}
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
            isDone
              ? 'bg-green-600 border-green-600'
              : 'border-[var(--border-color)] hover:border-indigo-500'
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
            <span className={`text-sm font-medium truncate ${isDone ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
              {task.title}
            </span>
            {onWinTheDayToggle && (
              <button
                onClick={(e) => { e.stopPropagation(); onWinTheDayToggle(task); }}
                className="flex-shrink-0 transition-colors"
                title={task.isWinTheDay ? 'Win the Day task' : 'Designate as Win the Day'}
              >
                <Star className={`h-4 w-4 ${task.isWinTheDay ? 'text-amber-400 fill-amber-400' : 'text-gray-600 hover:text-amber-400/60'}`} />
              </button>
            )}
            <StatusChip
              status={task.status}
              onStatusChange={(newStatus) => onStatusChange?.(task.id, newStatus)}
            />
          </div>
          {task.goal?.stack?.name && (
            <span className="text-xs text-[var(--text-muted)]">{task.goal.stack.name}</span>
          )}
          {task.taskType === 'MAINTENANCE' && task.processExecution?.process?.title && (
            <span className="text-xs text-orange-400/70">⚙ {task.processExecution.process.title}</span>
          )}
          {task.deliverable && (
            <p className="text-xs text-cyan-400/70 mt-1 truncate">→ {task.deliverable}</p>
          )}
        </div>

        {/* Time block badge */}
        {task.timeBlockStart && task.timeBlockEnd && (
          <span className="text-xs rounded px-2 py-0.5 bg-indigo-500/15 text-indigo-400 flex-shrink-0">
            {new Date(task.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
            {new Date(task.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}

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
            <span className="flex items-center gap-0.5 text-xs text-[var(--text-muted)]">
              <MessageSquare className="h-3.5 w-3.5" />
              {task._count.comments}
            </span>
          )}
          {(task._count?.children ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-[var(--text-muted)]" title={`${subtaskDoneCount(task.children)}/${task._count.children} subtasks done`}>
              <ListChecks className="h-3.5 w-3.5" />
              {subtaskDoneCount(task.children)}/{task._count.children}
            </span>
          )}
        </div>

        {/* Due date */}
        {task.dueDate && (
          <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
            {new Date(task.dueDate.split('T')[0] + 'T00:00:00').toLocaleDateString()}
          </span>
        )}

        {/* Hover actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            title="Edit task"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {!hideClearGoals && (
        <div onClick={(e) => e.stopPropagation()} className="pl-12 pr-4 mt-2">
          <ClearGoalsDisplay taskId={task.id} editable={false} compact />
        </div>
      )}
    </m.div>
  );
});
