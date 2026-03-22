import { toZonedTime } from 'date-fns-tz';

export type DerailStatus = 'ok' | 'at_risk' | 'derailing';

interface TaskLike {
  status: string;
  dueDate: Date | string | null;
}

/**
 * Check derailing status for a task based on user's local time.
 * - at_risk (orange): daily task TODO past 2pm local
 * - derailing (red): daily task !DONE past 6pm local
 */
export function checkTaskDerailStatus(
  task: TaskLike,
  timezone: string
): DerailStatus {
  if (task.status === 'DONE' || task.status === 'DROPPED') return 'ok';
  if (!task.dueDate) return 'ok';

  const now = new Date();
  const dueDate = new Date(task.dueDate);

  // Only check tasks due today
  const zonedNow = toZonedTime(now, timezone);
  const zonedDue = toZonedTime(dueDate, timezone);

  if (
    zonedNow.getFullYear() !== zonedDue.getFullYear() ||
    zonedNow.getMonth() !== zonedDue.getMonth() ||
    zonedNow.getDate() !== zonedDue.getDate()
  ) {
    return 'ok';
  }

  const hour = zonedNow.getHours();

  if (hour >= 18 && task.status !== 'DONE') return 'derailing';
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

/**
 * Get all derailing tasks for a user's task list.
 */
export function getDerailingTasks(
  tasks: TaskLike[],
  timezone: string
): { atRisk: TaskLike[]; derailing: TaskLike[] } {
  const atRisk: TaskLike[] = [];
  const derailing: TaskLike[] = [];

  for (const task of tasks) {
    const status = checkTaskDerailStatus(task, timezone);
    if (status === 'at_risk') atRisk.push(task);
    else if (status === 'derailing') derailing.push(task);
  }

  return { atRisk, derailing };
}
