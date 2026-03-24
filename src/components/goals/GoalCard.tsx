'use client';

import React, { useState, useRef, useEffect } from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2, Plus, Link, ChevronDown, BarChart3 } from 'lucide-react';
import { GoalProgressBar } from './GoalProgressBar';

const levelColors: Record<string, string> = {
  HIGH_HARD: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  STRATEGIC: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  MONTHLY: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
  WEEKLY: 'bg-green-600/20 text-green-400 border-green-600/30',
  DAILY: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
};

const levelLabels: Record<string, string> = {
  HIGH_HARD: 'HHG',
  STRATEGIC: 'Yearly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
};

const statusColors: Record<string, string> = {
  NOT_STARTED: 'text-gray-500',
  IN_PROGRESS: 'text-yellow-400',
  COMPLETED: 'text-green-400',
  ABANDONED: 'text-red-400',
};

const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;

const statusBgColors: Record<string, string> = {
  NOT_STARTED: 'hover:bg-gray-700',
  IN_PROGRESS: 'hover:bg-yellow-900/30',
  COMPLETED: 'hover:bg-green-900/30',
  ABANDONED: 'hover:bg-red-900/30',
};

interface GoalCardProps {
  goal: any;
  depth: number;
  onEdit: (goal: any) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (parentGoal: any) => void;
  onStatusChange?: (goalId: string, status: string) => void;
  onKpiClick?: (goal: any) => void;
  isCompanyStack?: boolean;
  isAdmin?: boolean;
  hasLinks?: boolean;
}

export const GoalCard = React.memo(function GoalCard({
  goal,
  depth,
  onEdit,
  onDelete,
  onAddChild,
  onStatusChange,
  onKpiClick,
}: GoalCardProps) {
  const canAddChild = goal.level !== 'DAILY';
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

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
      className="group"
      style={{ paddingLeft: `${depth * 24}px` }}
    >
      <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 hover:border-gray-700 transition-colors">
        {/* Level badge */}
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
            levelColors[goal.level] ?? levelColors.DAILY
          }`}
        >
          {levelLabels[goal.level] ?? goal.level}
        </span>
        {goal.level === 'HIGH_HARD' && (
          <span className="text-xs text-purple-400/70 italic">5-10 Year Goal</span>
        )}

        {/* Title and status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {goal.title}
            </span>
            <div className="relative" ref={statusRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-gray-800 ${statusColors[goal.status] ?? ''}`}
              >
                {goal.status.replace(/_/g, ' ')}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 z-50 w-36 rounded-lg border border-gray-700 bg-gray-800 shadow-xl py-1">
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
                      className={`flex w-full items-center px-3 py-1.5 text-xs ${statusColors[s]} ${statusBgColors[s]} ${
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
              <Link className="h-3 w-3 text-indigo-400" />
            )}
            {goal._count?.kpis > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onKpiClick?.(goal); }}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-600/30 bg-indigo-600/20 px-2 py-0.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 transition-colors"
              >
                <BarChart3 className="h-3 w-3" />
                {goal._count.kpis} KPI{goal._count.kpis !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="mt-1 max-w-xs">
            <GoalProgressBar progress={goal.progressPct} size="sm" />
          </div>
        </div>

        {/* Due date */}
        {goal.dueDate && (
          <span className="text-xs text-gray-500">
            {new Date(goal.dueDate).toLocaleDateString()}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddChild && (
            <button
              onClick={() => onAddChild(goal)}
              className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
              title="Add child goal"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
            title="Edit goal"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
            title="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </m.div>
  );
});
