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
  | 'GOOGLE_CAL'
  | 'POWER_DOWN'
  | 'MEETING';

export interface ColorDef {
  /** Primary hex color */
  color: string;
  /** Emoji identifier */
  emoji: string;
  /** Translucent background for cards/blocks */
  bg: string;
  /** Border color for left accents */
  border: string;
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
    textClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/15',
    borderClass: 'border-indigo-500/40',
    label: 'Improve',
    description: 'Move goals forward',
  },
  REACT: {
    color: '#fbbf24',
    emoji: '⚡',
    bg: 'rgba(251,191,36,0.15)',
    border: '#fbbf24',
    textClass: 'text-yellow-400',
    bgClass: 'bg-yellow-500/15',
    borderClass: 'border-yellow-500/40',
    label: 'React',
    description: 'Respond to incoming requests',
  },
  MAINTENANCE: {
    color: '#22d3ee',
    emoji: '🔧',
    bg: 'rgba(34,211,238,0.15)',
    border: '#22d3ee',
    textClass: 'text-cyan-400',
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
    textClass: 'text-teal-400',
    bgClass: 'bg-teal-500/15',
    borderClass: 'border-teal-500/40',
    label: 'AIM',
  },
  REVIEW: {
    color: '#f59e0b',
    emoji: '📋',
    bg: 'rgba(245,158,11,0.15)',
    border: '#f59e0b',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40',
    label: 'Review',
  },
  GOOGLE_CAL: {
    color: '#a855f7',
    emoji: '🟣',
    bg: 'rgba(168,85,247,0.15)',
    border: '#a855f7',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/40',
    label: 'Google Calendar',
  },
  POWER_DOWN: {
    color: '#8b5cf6',
    emoji: '🌙',
    bg: 'rgba(139,92,246,0.15)',
    border: '#8b5cf6',
    textClass: 'text-violet-400',
    bgClass: 'bg-violet-500/15',
    borderClass: 'border-violet-500/40',
    label: 'Power Down',
  },
  MEETING: {
    color: '#10b981',
    emoji: '🟢',
    bg: 'rgba(16,185,129,0.15)',
    border: '#10b981',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
    label: 'Meeting',
  },
};

/** Map task type enum values to Prism color keys */
export function taskTypeToColorKey(taskType: string): ItemType {
  switch (taskType) {
    case 'IMPROVE':
      return 'IMPROVE';
    case 'REACT':
      return 'REACT';
    case 'MAINTENANCE':
      return 'MAINTENANCE';
    case 'REVIEW':
      return 'REVIEW';
    default:
      return 'IMPROVE';
  }
}

/** Get color definition for a task type */
export function getTaskTypeColor(taskType: string): ColorDef {
  return PRISM_COLORS[taskTypeToColorKey(taskType)];
}

/** Weekly hour targets */
export const WEEKLY_HOUR_TARGET = 35;
export const WEEKLY_HOUR_WARNING = 20;
