import { getLocalDateString } from '@/lib/date-utils';

export function isTaskOverdue(task: { dueDate?: string | Date | null; status: string }): boolean {
  if (!task.dueDate || task.status === 'DONE') return false;
  const dueDateStr = typeof task.dueDate === 'string'
    ? task.dueDate.split('T')[0]
    : getLocalDateString(task.dueDate);
  return dueDateStr < getLocalDateString();
}

/** Count subtasks with status 'DONE'. */
export function subtaskDoneCount(children: { status: string }[] | undefined | null): number {
  if (!children) return 0;
  return children.filter((c) => c.status === 'DONE').length;
}

const MINUTES_PER_HOUR = 60;
const HOURS_PER_WORKDAY = 8;
const WORKDAYS_PER_WEEK = 5;

/**
 * Parse a free-form duration string to minutes.
 * Accepts: `90m`, `1.5h`, `2d`, `1w`, bare numbers (treated as minutes).
 * Returns null on an unparseable input.
 *
 * Days are treated as 8-hour workdays; weeks are 5 × 8h = 40h.
 */
export function parseDurationToMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([mhdw]?)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = (match[2] || 'm').toLowerCase();
  switch (unit) {
    case 'm': return Math.round(value);
    case 'h': return Math.round(value * MINUTES_PER_HOUR);
    case 'd': return Math.round(value * HOURS_PER_WORKDAY * MINUTES_PER_HOUR);
    case 'w': return Math.round(value * WORKDAYS_PER_WEEK * HOURS_PER_WORKDAY * MINUTES_PER_HOUR);
    default: return null;
  }
}

/** Format minutes for display: "30m", "1.5h", "2d", "1w". */
export function formatMinutesCompact(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = minutes / MINUTES_PER_HOUR;
  if (hours < HOURS_PER_WORKDAY) {
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  const days = hours / HOURS_PER_WORKDAY;
  if (days < WORKDAYS_PER_WEEK) {
    return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
  }
  const weeks = days / WORKDAYS_PER_WEEK;
  return Number.isInteger(weeks) ? `${weeks}w` : `${weeks.toFixed(1)}w`;
}
