import { toZonedTime } from 'date-fns-tz';

export type DerailStatus = 'ok' | 'at_risk' | 'derailing';

interface TaskLike {
  status: string;
  dueDate: Date | string | null;
}

/**
 * Check derailing status for a task based on user's local time.
 * - at_risk (orange): daily task TODO past 2pm local
 * - derailing (red): daily task not DONE past 6pm local
 */
export function checkTaskDerailStatus(
  task: TaskLike,
  timezone: string,
): DerailStatus {
  if (task.status === 'DONE' || task.status === 'DROPPED') return 'ok';
  if (!task.dueDate) return 'ok';

  const zonedNow = toZonedTime(new Date(), timezone);
  const zonedDue = toZonedTime(new Date(task.dueDate), timezone);

  // Only check tasks due today
  const sameDay =
    zonedNow.getFullYear() === zonedDue.getFullYear() &&
    zonedNow.getMonth() === zonedDue.getMonth() &&
    zonedNow.getDate() === zonedDue.getDate();
  if (!sameDay) return 'ok';

  const hour = zonedNow.getHours();
  if (hour >= 18) return 'derailing';
  if (hour >= 14 && task.status === 'TODO') return 'at_risk';

  return 'ok';
}

/**
 * Check if user's streak is at risk (no completions today, past noon).
 */
export function checkStreakAtRisk(
  completionsToday: number,
  timezone: string
): boolean {
  const zonedNow = toZonedTime(new Date(), timezone);
  return completionsToday === 0 && zonedNow.getHours() >= 12;
}
