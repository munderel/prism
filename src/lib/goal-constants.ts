export const LEVEL_LABELS: Record<string, string> = {
  HIGH_HARD: 'HHG',
  STRATEGIC: 'Yearly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
};

export const LEVEL_COLORS: Record<string, string> = {
  HIGH_HARD: 'bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-cyan-600/30 text-purple-300 border-purple-500/40',
  STRATEGIC: 'bg-violet-600/20 text-violet-400 border-violet-600/30',
  MONTHLY: 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30',
  WEEKLY: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
  DAILY: 'bg-gray-600/15 text-gray-400 border-gray-600/25',
};

export const GOAL_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'text-gray-500',
  IN_PROGRESS: 'text-yellow-400',
  COMPLETED: 'text-green-400',
  ABANDONED: 'text-red-400',
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
  TODO: 'text-gray-400',
  IN_PROGRESS: 'text-yellow-400',
  DONE: 'text-green-400',
  DROPPED: 'text-red-400',
};
