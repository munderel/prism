/**
 * Prism App — Centralized color system
 * Used across calendar, reviews, dashboard, tasks, and Google Calendar sync.
 * All components should import from here for consistency.
 */

export type ItemType =
  | 'IMPROVE'
  | 'REACT'
  | 'MAINTENANCE'
  | 'AIM'
  | 'REVIEW'
  | 'CHORE'
  | 'GOOGLE_CAL'
  | 'POWER_DOWN'
  | 'MEETING'
  | 'FOOD';

export interface ColorDef {
  /** Primary hex color */
  color: string;
  /** Emoji identifier */
  emoji: string;
  /** Translucent background for cards/blocks */
  bg: string;
  /** Border color for left accents */
  border: string;
  /** Darker text hex for light-mode backgrounds */
  textLight: string;
  /** Lighter text hex for dark-mode backgrounds */
  textDark: string;
  /** Tailwind text color class */
  textClass: string;
  /** Tailwind background class (for badges/chips) */
  bgClass: string;
  /** Tailwind border class */
  borderClass: string;
  /** Label shown in UI */
  label: string;
  /** Short description for tooltips */
  description?: string;
}

export const PRISM_COLORS: Record<ItemType, ColorDef> = {
  IMPROVE: {
    color: '#818cf8',
    emoji: '🎯',
    bg: 'rgba(99,102,241,0.15)',
    border: '#818cf8',
    textLight: '#3730a3',
    textDark: '#a5b4fc',
    textClass: 'text-indigo-700 dark:text-indigo-400',
    bgClass: 'bg-indigo-500/15',
    borderClass: 'border-indigo-500/40',
    label: 'Improve',
    description: 'Move goals forward',
  },
  REACT: {
    color: '#f97316',
    emoji: '⚡',
    bg: 'rgba(249,115,22,0.15)',
    border: '#f97316',
    textLight: '#9a3412',
    textDark: '#fdba74',
    textClass: 'text-orange-700 dark:text-orange-400',
    bgClass: 'bg-orange-500/15',
    borderClass: 'border-orange-500/40',
    label: 'React',
    description: 'Respond to incoming requests',
  },
  MAINTENANCE: {
    color: '#22d3ee',
    emoji: '🔧',
    bg: 'rgba(34,211,238,0.15)',
    border: '#22d3ee',
    textLight: '#155e75',
    textDark: '#67e8f9',
    textClass: 'text-cyan-700 dark:text-cyan-400',
    bgClass: 'bg-cyan-500/15',
    borderClass: 'border-cyan-500/40',
    label: 'Maintenance',
    description: 'Keep things running',
  },
  AIM: {
    color: '#2dd4bf',
    emoji: '💪',
    bg: 'rgba(45,212,191,0.15)',
    border: '#2dd4bf',
    textLight: '#115e59',
    textDark: '#5eead4',
    textClass: 'text-teal-700 dark:text-teal-400',
    bgClass: 'bg-teal-500/15',
    borderClass: 'border-teal-500/40',
    label: 'AIM',
  },
  REVIEW: {
    color: '#fb7185',
    emoji: '📋',
    bg: 'rgba(251,113,133,0.15)',
    border: '#fb7185',
    textLight: '#9f1239',
    textDark: '#fda4af',
    textClass: 'text-rose-700 dark:text-rose-400',
    bgClass: 'bg-rose-500/15',
    borderClass: 'border-rose-500/40',
    label: 'Review',
  },
  CHORE: {
    color: '#94a3b8',
    emoji: '🧹',
    bg: 'rgba(148,163,184,0.15)',
    border: '#94a3b8',
    textLight: '#334155',
    textDark: '#cbd5e1',
    textClass: 'text-slate-700 dark:text-slate-400',
    bgClass: 'bg-slate-500/15',
    borderClass: 'border-slate-500/40',
    label: 'Chore',
    description: 'One-off admin or household tasks',
  },
  GOOGLE_CAL: {
    color: '#a855f7',
    emoji: '🟣',
    bg: 'rgba(168,85,247,0.15)',
    border: '#a855f7',
    textLight: '#6b21a8',
    textDark: '#c084fc',
    textClass: 'text-purple-700 dark:text-purple-400',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/40',
    label: 'Google Calendar',
  },
  POWER_DOWN: {
    color: '#8b5cf6',
    emoji: '🌙',
    bg: 'rgba(139,92,246,0.15)',
    border: '#8b5cf6',
    textLight: '#5b21b6',
    textDark: '#a78bfa',
    textClass: 'text-violet-700 dark:text-violet-400',
    bgClass: 'bg-violet-500/15',
    borderClass: 'border-violet-500/40',
    label: 'Power Down',
  },
  MEETING: {
    color: '#10b981',
    emoji: '🟢',
    bg: 'rgba(16,185,129,0.15)',
    border: '#10b981',
    textLight: '#065f46',
    textDark: '#6ee7b7',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
    label: 'Meeting',
  },
  FOOD: {
    color: '#f59e0b',
    emoji: '🍽️',
    bg: 'rgba(245,158,11,0.15)',
    border: '#f59e0b',
    textLight: '#92400e',
    textDark: '#fcd34d',
    textClass: 'text-amber-700 dark:text-amber-400',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40',
    label: 'Food',
    description: 'Meal / eating block',
  },
};

const TASK_TYPE_KEYS: Set<string> = new Set(['IMPROVE', 'REACT', 'MAINTENANCE', 'REVIEW', 'CHORE']);

/** Map task type enum values to Prism color keys */
export function taskTypeToColorKey(taskType: string): ItemType {
  return TASK_TYPE_KEYS.has(taskType) ? (taskType as ItemType) : 'IMPROVE';
}

/** Get color definition for a task type */
export function getTaskTypeColor(taskType: string): ColorDef {
  return PRISM_COLORS[taskTypeToColorKey(taskType)];
}

/** Weekly hour targets */
export const WEEKLY_HOUR_TARGET = 35;
export const WEEKLY_HOUR_WARNING = 20;
