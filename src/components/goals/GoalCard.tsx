'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { m } from 'framer-motion';
import { Pencil, Trash2, Plus, ListTodo, Link, ChevronDown, BarChart3, UserPlus } from 'lucide-react';
import { GoalAssigneesModal } from './GoalAssigneesModal';
import { GoalProgressBar } from './GoalProgressBar';
import { TimeUrgencyBadge } from './TimeUrgencyBadge';
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  GOAL_STATUS_COLORS,
  GOAL_STATUSES,
  GOAL_STATUS_BG_COLORS,
  formatEnumLabel,
  formatGoalDateRange,
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
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const styles = getLevelCardStyles(goal.level);
  const dateLabel = formatGoalDateRange(goal.level, goal.startDate, goal.endDate);

  useClickOutside(statusRef, useCallback(() => setShowStatusMenu(false), []), showStatusMenu);

  return (
    <m.div
      layout
      layoutId={goal.id}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.005, y: -1 }}
      whileTap={{ scale: 0.998 }}
      className={`group ${showStatusMenu ? 'relative z-[100]' : ''}`}
      style={{ paddingLeft: `${depth * 24}px` }}
    >
      <div
        className={`flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--glass-bg)] ${styles.padding} hover:border-white/[0.1] transition-colors ${styles.wrapper}`}>
        {/* Level badge */}
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0 ${
            LEVEL_COLORS[goal.level] ?? LEVEL_COLORS.DAILY
          }`}
        >
          {LEVEL_LABELS[goal.level] ?? goal.level}
        </span>
        {dateLabel && (
          <span className={`text-xs shrink-0 ${goal.level === 'HIGH_HARD' ? 'text-purple-400/60 italic' : 'text-[var(--text-muted)]'}`}>
            {dateLabel}
          </span>
        )}

        {/* Title and status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[var(--text-primary)] ${goal.level === 'HIGH_HARD' ? 'line-clamp-3 break-words' : 'truncate'} ${styles.titleClass}`}
              title={goal.title}
            >
              {goal.title}
            </span>
            <div className="relative" ref={statusRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--hover-bg)] ${GOAL_STATUS_COLORS[goal.status] ?? ''}`}
              >
                {formatEnumLabel(goal.status)}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 z-50 w-36 rounded-lg border border-white/[0.08] bg-[var(--surface-raised)] backdrop-blur-lg shadow-xl py-1">
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
                      {formatEnumLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {goal.companyGoalLinks?.length > 0 && (
              <Link className="h-3 w-3 text-prism-indigo" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onKpiClick?.(goal); }}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400 cursor-pointer hover:bg-indigo-600/30 transition-colors"
              title={goal._count?.kpis > 0 ? 'View KPIs' : 'Add KPIs'}
            >
              <BarChart3 className="h-3 w-3" />
              {goal._count?.kpis > 0
                ? `${goal._count.kpis} KPI${goal._count.kpis !== 1 ? 's' : ''}`
                : 'KPIs'}
            </button>
          </div>
          <div className="mt-1 max-w-xs">
            <GoalProgressBar progress={goal.progressPct} size="sm" />
          </div>
        </div>

        {/* Assignees avatar stack (up to 3 + overflow count) */}
        <button
          onClick={(e) => { e.stopPropagation(); setAssigneesOpen(true); }}
          className="flex items-center shrink-0 rounded hover:bg-[var(--hover-bg)] px-1 py-0.5"
          title={goal.assignees?.length
            ? `${goal.assignees.length} assignee${goal.assignees.length > 1 ? 's' : ''} — click to manage`
            : 'No assignee — click to assign'}
        >
          {goal.assignees && goal.assignees.length > 0 ? (
            <div className="flex -space-x-1.5">
              {goal.assignees.slice(0, 3).map((a: { id: string; user: { id: string; name: string | null; email: string; image: string | null } }) => {
                const label = a.user.name ?? a.user.email;
                const initials = label.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || label[0]?.toUpperCase() || '?';
                return a.user.image ? (
                  <img
                    key={a.id}
                    src={a.user.image}
                    alt={label}
                    className="h-5 w-5 rounded-full border border-[var(--glass-bg)] object-cover"
                  />
                ) : (
                  <span
                    key={a.id}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--glass-bg)] bg-indigo-500/60 text-[9px] font-semibold text-white"
                    title={label}
                  >
                    {initials}
                  </span>
                );
              })}
              {goal.assignees.length > 3 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--glass-bg)] bg-[var(--hover-bg)] text-[9px] font-semibold text-[var(--text-muted)]">
                  +{goal.assignees.length - 3}
                </span>
              )}
            </div>
          ) : (
            <UserPlus className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>

        {/* Urgency badge based on end date */}
        {goal.endDate && (
          <div className="flex items-center gap-2 shrink-0">
            <TimeUrgencyBadge startDate={goal.startDate} endDate={goal.endDate} />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddChild && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(goal); }}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              title="Add child goal"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {canAddTask && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddTask?.(goal.id); }}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-emerald-400"
              title="Add task"
            >
              <ListTodo className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            title="Edit goal"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400"
            title="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {assigneesOpen && (
        <GoalAssigneesModal
          goalId={goal.id}
          goalTitle={goal.title}
          onClose={() => setAssigneesOpen(false)}
        />
      )}
    </m.div>
  );
});
