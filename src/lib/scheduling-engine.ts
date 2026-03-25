/**
 * Auto-Scheduling Engine — Pure Client-Side Functions
 *
 * Takes unscheduled tasks + existing calendar events + working hours
 * and returns proposed time slots. No database, no API calls.
 */

// ---------- Types ----------

export interface SchedulableTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: Date | null;
  preferredTimeStart: string | null; // "HH:mm"
  preferredTimeEnd: string | null;   // "HH:mm"
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

// ---------- Priority ordering ----------

const PRIORITY_RANK: Record<SchedulableTask['priority'], number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

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
  // Filter occupied events that overlap with our range
  const relevant = occupied
    .filter((e) => e.start.getTime() < rangeEnd.getTime() && e.end.getTime() > rangeStart.getTime())
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

    // dueDate ASC, nulls last
    if (a.dueDate && b.dueDate) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return 0;
  });

  // Accumulate occupied slots (existing events + newly scheduled)
  const occupied: CalendarEvent[] = [...existingEvents];
  const results: ProposedSlot[] = [];

  for (const task of sorted) {
    const horizon = task.dueDate ?? endOfWeek;
    const durationMs = task.estimatedMinutes * 60 * 1000;
    const days = getDaysBetween(now, horizon);

    let scheduled = false;

    // First pass: try preferred time window on each day
    if (task.preferredTimeStart && task.preferredTimeEnd) {
      for (const day of days) {
        const prefStart = setTimeOnDate(day, task.preferredTimeStart);
        const prefEnd = setTimeOnDate(day, task.preferredTimeEnd);

        const slot = findSlotInRange(day, prefStart, prefEnd, durationMs, occupied);
        if (slot) {
          const slotEnd = new Date(slot.getTime() + durationMs);
          results.push({ taskId: task.id, start: slot, end: slotEnd });
          occupied.push({ start: slot, end: slotEnd });
          scheduled = true;
          break;
        }
      }
    }

    // Second pass: try any working-hours slot
    if (!scheduled) {
      for (const day of days) {
        const whStart = setTimeOnDate(day, workingHours.start);
        const whEnd = setTimeOnDate(day, workingHours.end);

        const slot = findSlotInRange(day, whStart, whEnd, durationMs, occupied);
        if (slot) {
          const slotEnd = new Date(slot.getTime() + durationMs);
          results.push({ taskId: task.id, start: slot, end: slotEnd });
          occupied.push({ start: slot, end: slotEnd });
          scheduled = true;
          break;
        }
      }
    }

    // If still not scheduled, silently exclude
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
