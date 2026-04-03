/**
 * Process page constants — cadence colors, options, helpers.
 * Uses dark: prefix pattern matching prism-colors.ts for theme safety.
 */

// ── Cadence colors (theme-safe) ──

export interface CadenceColorDef {
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const CADENCE_COLORS: Record<string, CadenceColorDef> = {
  DAILY: {
    textClass: 'text-rose-700 dark:text-rose-400',
    bgClass: 'bg-rose-500/15',
    borderClass: 'border-rose-500/40',
  },
  WEEKLY: {
    textClass: 'text-blue-700 dark:text-blue-400',
    bgClass: 'bg-blue-500/15',
    borderClass: 'border-blue-500/40',
  },
  BIWEEKLY: {
    textClass: 'text-cyan-700 dark:text-cyan-400',
    bgClass: 'bg-cyan-500/15',
    borderClass: 'border-cyan-500/40',
  },
  MONTHLY: {
    textClass: 'text-purple-700 dark:text-purple-400',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/40',
  },
  QUARTERLY: {
    textClass: 'text-amber-700 dark:text-amber-400',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40',
  },
  YEARLY: {
    textClass: 'text-emerald-700 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
  },
};

const CADENCE_FALLBACK: CadenceColorDef = {
  textClass: 'text-[var(--text-secondary)]',
  bgClass: 'bg-[var(--surface-raised)]',
  borderClass: 'border-[var(--border-color)]',
};

export function cadenceBadgeClasses(cadence: string): string {
  const c = CADENCE_COLORS[cadence] ?? CADENCE_FALLBACK;
  return `${c.bgClass} ${c.textClass} ${c.borderClass}`;
}

// ── Mode colors (theme-safe) ──

export const MODE_COLORS: Record<string, CadenceColorDef> = {
  BASIC: {
    textClass: 'text-emerald-700 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
  },
  ADVANCED: {
    textClass: 'text-blue-700 dark:text-blue-400',
    bgClass: 'bg-blue-500/15',
    borderClass: 'border-blue-500/40',
  },
};

export function modeBadgeClasses(mode: string): string {
  const c = MODE_COLORS[mode] ?? CADENCE_FALLBACK;
  return `${c.bgClass} ${c.textClass} ${c.borderClass}`;
}

// ── Options ──

export const CADENCE_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

// ── Helpers ──

export function formatDurationLabel(mins: number): string {
  return mins < 60 ? `${mins}m` : `${mins / 60}h`;
}

export function formatDurationDisplay(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function cadenceNeedsDayOfWeek(cadence: string): boolean {
  return cadence === 'WEEKLY' || cadence === 'BIWEEKLY';
}

export function cadenceNeedsDayOfMonth(cadence: string): boolean {
  return cadence === 'MONTHLY' || cadence === 'QUARTERLY';
}

export function cadenceNeedsDate(cadence: string): boolean {
  return cadence === 'YEARLY' || cadence === 'ONE_TIME';
}

export function formatCadenceLabel(cadence: string): string {
  return cadence.charAt(0) + cadence.slice(1).toLowerCase().replace('_', ' ');
}

export const INPUT_CLASSES =
  'rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';
