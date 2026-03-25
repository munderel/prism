'use client';

import React, { useState, useRef, useEffect } from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2, Plus, ListTodo, Link, ChevronDown, BarChart3 } from 'lucide-react';
import { GoalProgressBar } from './GoalProgressBar';
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  GOAL_STATUS_COLORS,
  GOAL_STATUSES,
  GOAL_STATUS_BG_COLORS,
} from '@/lib/goal-constants';

// Level-specific card styling
function getLevelCardStyles(level: string) {
  switch (level) {
    case 'HIGH_HARD':
      return {
        wrapper: 'prism-border-top prism-glow',
        padding: 'px-5 py-4',
        titleClass: 'font-display text-base font-semibold',
      };
    case 'STRATEGIC':
      return {
        wrapper: 'border-l-2 border-l-violet-500/50',
        padding: 'px-4 py-3',
        titleClass: 'font-display text-sm font-semibold',
      };
    case 'MONTHLY':
      return {
        wrapper: 'border-l-2 border-l-indigo-500/30',
        padding: 'px-4 py-3',
        titleClass: 'text-sm font-medium',
      };
    case 'WEEKLY':
      return {
        wrapper: '',
        padding: 'px-4 py-3',
        titleClass: 'text-sm font-medium',
      };
    case 'DAILY':
      return {
        wrapper: '',
        padding: 'px-3 py-2',
        titleClass: 'text-xs font-medium',
      };
    default:
      return {
        wrapper: '',
        padding: 'px-4 py-3',
        titleClass: 'text-sm font-medium',
      };
  }
}

interface GoalCardProps {
  goal: any;
  depth: number;
  onEdit: (goal: any) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (parentGoal: any) => void;
  onAddTask?: (goalId: string) => void;
  onStatusChange?: (goalId: string, status: string) => void;
  onKpiClick?: (goal: any) => void;
}

export const GoalCard = React.memo(function GoalCard({
  goal,
  depth,
  onEdit,
  onDelete,
  onAddChild,
  onAddTask,
  onStatusChange,
  onKpiClick,
}: GoalCardProps) {
  const canAddChild = !['DAILY', 'WEEKLY'].includes(goal.level);
  const canAddTask = goal.level === 'WEEKLY';
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const styles = getLevelCardStyles(goal.level);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    if (showStatusMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStatusMenu]);

  return (
    <m.div
      layout
      layoutId={goal.id}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.005, y: -1 }}
      whileTap={{ scale: 0.998 }}
      className="group"
      style={{ paddingLeft: `${depth * 24}px` }}
    >
      <div
        onClick={() => onKpiClick?.(goal)}
        className={`flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[var(--glass-bg)] ${styles.padding} hover:border-white/[0.1] transition-colors cursor-pointer ${styles.wrapper}`}>
        {/* Level badge */}
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0 ${
            LEVEL_COLORS[goal.level] ?? LEVEL_COLORS.DAILY
          }`}
        >
          {LEVEL_LABELS[goal.level] ?? goal.level}
        </span>
        {goal.level === 'HIGH_HARD' && (
          <span className="text-xs text-purple-400/60 italic shrink-0">5-10 Year Goal</span>
        )}

        {/* Title and status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-white truncate ${styles.titleClass}`}>
              {goal.title}
            </span>
            <div className="relative" ref={statusRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-white/[0.05] ${GOAL_STATUS_COLORS[goal.status] ?? ''}`}
              >
                {goal.status.replace(/_/g, ' ')}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 z-50 w-36 rounded-lg border border-white/[0.08] bg-gray-800/95 backdrop-blur-lg shadow-xl py-1">
                  {GOAL_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStatusMenu(false);
                        if (s !== goal.status && onStatusChange) {
                          onStatusChange(goal.id, s);
                        }
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-xs ${GOAL_STATUS_COLORS[s]} ${GOAL_STATUS_BG_COLORS[s]} ${
                        s === goal.status ? 'font-bold' : ''
                      }`}
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {goal.companyGoalLinks?.length > 0 && (
              <Link className="h-3 w-3 text-prism-indigo" />
            )}
            {goal._count?.kpis > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400"
              >
                <BarChart3 className="h-3 w-3" />
                {goal._count.kpis} KPI{goal._count.kpis !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="mt-1 max-w-xs">
            <GoalProgressBar progress={goal.progressPct} size="sm" />
          </div>
        </div>

        {/* Due date */}
        {goal.dueDate && (
          <span className="text-xs text-gray-500 shrink-0">
            {new Date(goal.dueDate).toLocaleDateString()}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddChild && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(goal); }}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-white"
              title="Add child goal"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {canAddTask && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddTask?.(goal.id); }}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-emerald-400"
              title="Add task"
            >
              <ListTodo className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-white"
            title="Edit goal"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-red-400"
            title="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </m.div>
  );
});
