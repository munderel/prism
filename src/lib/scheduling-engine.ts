/**
 * Auto-Scheduling Engine — Pure Client-Side Functions
 *
 * Takes unscheduled tasks + existing calendar events + working hours
 * and returns proposed time slots. No database, no API calls.
 */

import { PRIORITY_RANK as SHARED_PRIORITY_RANK, type TaskPriority } from '@/lib/task-priority';
import { rangesOverlap } from '@/lib/date-utils';

// ---------- Types ----------

export interface SchedulableTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  dueDate: Date | null;
  schedulingPeriod?: 'working' | 'casual' | 'both';
}

export interface CalendarEvent {
  start: Date;
  end: Date;
}

export interface WorkingHours {
  start: string; // e.g. "06:00"
  end: string;   // e.g. "22:00"
}

export interface ProposedSlot {
  taskId: string;
  start: Date;
  end: Date;
}

export interface ScheduleSettings {
  workingHours: WorkingHours;   // e.g. { start: '09:00', end: '17:00' }
  casualHours: WorkingHours;    // e.g. { start: '17:00', end: '22:00' }
}

// ---------- Priority ordering ----------

// Re-export under the local name so the rest of this file's call sites stay
// untouched. Adding a new TaskPriority value is now a single-file change in
// `src/lib/task-priority.ts`.
const PRIORITY_RANK = SHARED_PRIORITY_RANK;

// ---------- Helper functions ----------

/**
 * Parse an "HH:mm" string into { hours, minutes }.
 */
export function parseTime(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hours: h, minutes: m };
}

/**
 * Return the end of the current week (Sunday 23:59:59) for a given date.
 * If `today` is already Sunday, returns that same Sunday at 23:59:59.
 */
export function getEndOfWeek(today: Date): Date {
  const result = new Date(today);
  const dayOfWeek = result.getDay(); // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  result.setDate(result.getDate() + daysUntilSunday);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Set hours and minutes on a date from an "HH:mm" string.
 * Seconds and milliseconds are zeroed out.
 */
export function setTimeOnDate(date: Date, hhmm: string): Date {
  const { hours, minutes } = parseTime(hhmm);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Return an array of Date objects for each calendar day from `start` to `end` (inclusive).
 * Each returned Date is at midnight of that day.
 */
export function getDaysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  const endNormalized = new Date(end);
  endNormalized.setHours(23, 59, 59, 999);

  while (current.getTime() <= endNormalized.getTime()) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Find the first available slot of `durationMs` milliseconds within a time range on a given day,
 * avoiding all occupied intervals.
 *
 * @param _day - The calendar day (used for context; rangeStart/rangeEnd carry the actual times)
 * @param rangeStart - Earliest possible start time
 * @param rangeEnd - Latest possible end time
 * @param durationMs - Required duration in milliseconds
 * @param occupied - Array of existing events that block time
 * @returns The start Date of the first available slot, or null if none fits
 */
export function findSlotInRange(
  _day: Date,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
  occupied: CalendarEvent[]
): Date | null {
  const relevant = occupied
    .filter((e) => rangesOverlap(e.start, e.end, rangeStart, rangeEnd))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let candidate = rangeStart.getTime();

  for (const event of relevant) {
    const eventStart = event.start.getTime();
    const eventEnd = event.end.getTime();

    // If candidate + duration fits before this event starts, we have a slot
    if (candidate + durationMs <= eventStart) {
      return new Date(candidate);
    }

    // Otherwise, move candidate past this event
    if (eventEnd > candidate) {
      candidate = eventEnd;
    }
  }

  // Check after all events
  if (candidate + durationMs <= rangeEnd.getTime()) {
    return new Date(candidate);
  }

  return null;
}

/**
 * Check whether two Dates fall on the same calendar day.
 */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Try to find an available slot across multiple days within the given time range.
 * On `now`'s day, the range start is clamped to the current time to avoid scheduling in the past.
 * Returns the slot start time, or null if no day has availability.
 */
function findSlotAcrossDays(
  days: Date[],
  now: Date,
  hours: WorkingHours,
  durationMs: number,
  occupied: CalendarEvent[]
): Date | null {
  for (const day of days) {
    let rangeStart = setTimeOnDate(day, hours.start);
    const rangeEnd = setTimeOnDate(day, hours.end);

    if (isSameDay(day, now) && now.getTime() > rangeStart.getTime()) {
      rangeStart = new Date(now);
    }

    if (rangeStart.getTime() >= rangeEnd.getTime()) continue;

    const slot = findSlotInRange(day, rangeStart, rangeEnd, durationMs, occupied);
    if (slot) return slot;
  }
  return null;
}

// ---------- Main scheduling function ----------

/**
 * Auto-schedule tasks into available time slots.
 *
 * Algorithm:
 * 1. Sort tasks by priority DESC (URGENT > HIGH > MEDIUM > LOW), then dueDate ASC (nulls last)
 * 2. For each task, determine scheduling horizon: dueDate if set, else end of current week (Sunday)
 * 3. First pass: try preferred time window if set
 * 4. Second pass: try any working-hours slot
 * 5. For each day in horizon, find first gap that fits estimatedMinutes without overlapping
 * 6. Mark occupied slots as we go so subsequent tasks don't overlap
 * 7. Return ProposedSlot[] (tasks that couldn't be scheduled are silently excluded)
 */
export function autoSchedule(
  tasks: SchedulableTask[],
  existingEvents: CalendarEvent[],
  workingHours: WorkingHours,
  today?: Date
): ProposedSlot[] {
  const now = today ?? new Date();
  const endOfWeek = getEndOfWeek(now);

  // Sort: priority DESC, then dueDate ASC (nulls last)
  const sorted = [...tasks].sort((a, b) => {
    const priDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priDiff !== 0) return priDiff;

    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return 0;
  });

  const occupied: CalendarEvent[] = [...existingEvents];
  const results: ProposedSlot[] = [];

  for (const task of sorted) {
    const horizon = task.dueDate ?? endOfWeek;
    const durationMs = task.estimatedMinutes * 60 * 1000;
    const days = getDaysBetween(now, horizon);

    // Find a working-hours slot
    let slot: Date | null = null;
    slot = findSlotAcrossDays(days, now, workingHours, durationMs, occupied);

    if (slot) {
      const slotEnd = new Date(slot.getTime() + durationMs);
      results.push({ taskId: task.id, start: slot, end: slotEnd });
      occupied.push({ start: slot, end: slotEnd });
    }
  }

  return results;
}

// ---------- Convenience wrapper ----------

/**
 * Rearrange flexible tasks around fixed events.
 * Convenience wrapper that calls autoSchedule().
 */
export function rearrangeFlexible(
  flexibleTasks: SchedulableTask[],
  fixedEvents: CalendarEvent[],
  workingHours: WorkingHours,
  today?: Date
): ProposedSlot[] {
  return autoSchedule(flexibleTasks, fixedEvents, workingHours, today);
}

// ---------- Period-aware scheduling ----------

/**
 * Auto-schedule tasks respecting their scheduling period preference.
 *
 * Groups tasks by `schedulingPeriod`:
 * - 'working': scheduled within `settings.workingHours`
 * - 'casual':  scheduled within `settings.casualHours`
 * - 'both':    scheduled within the combined range (earliest start to latest end)
 *
 * Each group is scheduled independently via `autoSchedule`, but they all
 * share the same `existingEvents` so occupied slots are respected across groups.
 */
export function autoScheduleWithPeriods(
  tasks: SchedulableTask[],
  existingEvents: CalendarEvent[],
  settings: ScheduleSettings,
  today?: Date
): ProposedSlot[] {
  // Group tasks by scheduling period
  const groups: Record<string, SchedulableTask[]> = { working: [], casual: [], both: [] };
  for (const task of tasks) {
    const period = task.schedulingPeriod ?? 'both';
    groups[period].push(task);
  }

  // Compute combined hours range for 'both' tasks
  const toMinutes = (hhmm: string): number => {
    const { hours, minutes } = parseTime(hhmm);
    return hours * 60 + minutes;
  };
  const fromMinutes = (total: number): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  };
  const combinedHours: WorkingHours = {
    start: fromMinutes(Math.min(toMinutes(settings.workingHours.start), toMinutes(settings.casualHours.start))),
    end: fromMinutes(Math.max(toMinutes(settings.workingHours.end), toMinutes(settings.casualHours.end))),
  };

  // Schedule each group in priority order; accumulate occupied slots across groups
  const allOccupied: CalendarEvent[] = [...existingEvents];
  const results: ProposedSlot[] = [];

  const schedule: Array<[SchedulableTask[], WorkingHours]> = [
    [groups.working, settings.workingHours],
    [groups.casual, settings.casualHours],
    [groups.both, combinedHours],
  ];

  for (const [groupTasks, hours] of schedule) {
    const slots = autoSchedule(groupTasks, allOccupied, hours, today);
    for (const slot of slots) {
      results.push(slot);
      allOccupied.push({ start: slot.start, end: slot.end });
    }
  }

  return results;
}
