import type { LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Shared types for period review wizards                             */
/* ------------------------------------------------------------------ */

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  progressPct: number;
  parentId: string | null;
  parent?: Goal | null;
  children?: Goal[];
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  stackId: string;
}

/* ------------------------------------------------------------------ */
/*  Hierarchy helper types                                              */
/* ------------------------------------------------------------------ */

/** A goal grouped under its HHG ancestor for display */
export interface HhgGroup {
  hhg: Goal;
  yearlyGoals: YearlyGroup[];
}

export interface YearlyGroup {
  yearly: Goal;
  monthlyGoals: Goal[];
}

export interface Kpi {
  id: string;
  name: string;
  type: 'NUMERIC' | 'BINARY';
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  goalId: string;
}

export interface ReviewAnswer {
  id: string;
  stepKey: string;
  answerType: string;
  answerData: any;
}

export interface StepConfig {
  key: string;
  title: string;
  icon: LucideIcon;
}

export const STATUS_OPTIONS = ['On Track', 'Behind', 'At Risk', 'Completed'] as const;
export const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;

/** Returns Tailwind classes for a goal status badge */
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-500/20 text-green-400';
    case 'IN_PROGRESS':
      return 'bg-blue-500/20 text-blue-400';
    case 'ABANDONED':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-[var(--surface-raised)] text-[var(--text-muted)]';
  }
}

/** Returns Tailwind classes for a task priority badge */
export function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'bg-red-500/20 text-red-400';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400';
    case 'MEDIUM': return 'bg-blue-500/20 text-blue-400';
    default: return 'bg-[var(--surface-raised)] text-[var(--text-muted)]';
  }
}
