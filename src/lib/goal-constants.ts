import { formatDateOnly } from './date-utils';

export const LEVEL_LABELS: Record<string, string> = {
  HIGH_HARD: 'High Hard Goal',
  STRATEGIC: 'Yearly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
};

export const LEVEL_COLORS: Record<string, string> = {
  HIGH_HARD: 'bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-cyan-600/30 text-purple-700 dark:text-purple-300 border-purple-500/40',
  STRATEGIC: 'bg-violet-100 dark:bg-violet-600/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-600/30',
  MONTHLY: 'bg-indigo-100 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-600/30',
  WEEKLY: 'bg-cyan-100 dark:bg-cyan-600/20 text-cyan-800 dark:text-cyan-400 border-cyan-200 dark:border-cyan-600/30',
  DAILY: 'bg-gray-100 dark:bg-gray-600/15 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600/25',
};

export const REVIEW_LEVEL_COLORS: Record<string, string> = {
  WEEKLY: 'bg-green-600 text-slate-950 dark:text-white border-transparent',
  MONTHLY: 'bg-blue-600 text-white border-transparent',
  YEARLY: 'bg-amber-600 text-slate-950 dark:text-white border-transparent',
};

export const GOAL_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'text-gray-500',
  IN_PROGRESS: 'text-yellow-700 dark:text-yellow-400',
  COMPLETED: 'text-green-700 dark:text-green-400',
  ABANDONED: 'text-red-700 dark:text-red-400',
};

export const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;

export const GOAL_STATUS_BG_COLORS: Record<string, string> = {
  NOT_STARTED: 'hover:bg-gray-700',
  IN_PROGRESS: 'hover:bg-yellow-900/30',
  COMPLETED: 'hover:bg-green-900/30',
  ABANDONED: 'hover:bg-red-900/30',
};

export const PRIORITY_DOT_COLORS: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-gray-500',
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: 'text-gray-600 dark:text-gray-400',
  IN_PROGRESS: 'text-yellow-700 dark:text-yellow-400',
  DONE: 'text-green-700 dark:text-green-400',
  DROPPED: 'text-red-700 dark:text-red-400',
};

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'DROPPED'] as const;

/**
 * Format an enum-style string for display: NOT_STARTED → "Not Started"
 */
export function formatEnumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a goal's date range for display based on its level. Goal date fields
 * are stored as UTC midnight; formatDateOnly handles the UTC anchoring so the
 * displayed dates don't shift across timezones.
 */
export function formatGoalDateRange(
  level: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string | null {
  if (!startDate) {
    return level === 'HIGH_HARD' ? '5-10 Year Goal' : null;
  }

  const s = new Date(startDate);

  if (!endDate) {
    if (level === 'HIGH_HARD') return '5-10 Year Goal';
    if (level === 'STRATEGIC') return String(s.getUTCFullYear());
    return null;
  }

  const e = new Date(endDate);

  switch (level) {
    case 'HIGH_HARD': {
      const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        const start = formatDateOnly(s, { year: undefined, month: 'short', day: 'numeric' });
        const end = formatDateOnly(e, { month: 'short', day: 'numeric' });
        return `${start} \u2013 ${end}`;
      }
      const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
      if (months < 12) {
        const start = formatDateOnly(s, { month: 'short', day: undefined });
        const end = formatDateOnly(e, { month: 'short', day: undefined });
        return `${months}-Month Goal (${start} \u2013 ${end})`;
      }
      const years = e.getUTCFullYear() - s.getUTCFullYear();
      const label = years <= 1 ? '1-Year' : `${years}-Year`;
      return `${label} High Hard Goal (${s.getUTCFullYear()}\u2013${e.getUTCFullYear()})`;
    }
    case 'STRATEGIC':
      return String(s.getUTCFullYear());
    case 'MONTHLY':
      return formatDateOnly(s, { month: 'long', day: undefined });
    case 'WEEKLY': {
      const start = formatDateOnly(s, { year: undefined, month: 'short', day: 'numeric' });
      const end = formatDateOnly(e, { month: 'short', day: 'numeric' });
      return `${start} \u2013 ${end}`;
    }
    default:
      return null;
  }
}
