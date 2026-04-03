import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Generate recurring meeting instances within a date range.
 * Shared by the calendar API route and the meeting reminders cron.
 */
export function generateMeetingInstances(
  meeting: { cadence: string; dayOfWeek: number | null; occurDate?: Date | null; timeStart: string; timeEnd: string },
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): { start: Date; end: Date }[] {
  const instances: { start: Date; end: Date }[] = [];

  // One-time meetings: just check if the specific date falls in range
  if (meeting.cadence === 'ONE_TIME' && meeting.occurDate) {
    const zoned = toZonedTime(new Date(meeting.occurDate), timezone);
    const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
    const s = fromZonedTime(`${dateKey}T${meeting.timeStart}:00`, timezone);
    const e = fromZonedTime(`${dateKey}T${meeting.timeEnd}:00`, timezone);
    if (s >= rangeStart && s <= rangeEnd) {
      instances.push({ start: s, end: e });
    }
    return instances;
  }

  // Iterate day-by-day through range (capped at 366 days for safety)
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  const maxIterations = 366;
  let iterations = 0;

  while (cursor <= rangeEnd && iterations < maxIterations) {
    iterations++;
    const zoned = toZonedTime(cursor, timezone);
    const dow = zoned.getDay(); // 0=Sun ... 6=Sat
    let matches = false;

    switch (meeting.cadence) {
      case 'DAILY':
        // Every weekday (Mon-Fri) if no dayOfWeek specified, otherwise every day
        matches = meeting.dayOfWeek === null ? (dow >= 1 && dow <= 5) : true;
        break;
      case 'WEEKLY':
        matches = meeting.dayOfWeek !== null ? dow === meeting.dayOfWeek : dow === 1; // default Monday
        break;
      case 'BIWEEKLY': {
        // Match the day of week, every other week (using epoch week parity)
        const targetDow = meeting.dayOfWeek ?? 1;
        if (dow === targetDow) {
          const weekNum = Math.floor(cursor.getTime() / (7 * 24 * 60 * 60 * 1000));
          matches = weekNum % 2 === 0;
        }
        break;
      }
      case 'MONTHLY':
        // First occurrence of the specified day in the month
        if (meeting.dayOfWeek !== null) {
          matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
        } else {
          matches = zoned.getDate() === 1; // first of month
        }
        break;
      case 'QUARTERLY':
        // First occurrence of the day in quarter months (Jan, Apr, Jul, Oct)
        if ([0, 3, 6, 9].includes(zoned.getMonth())) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
          } else {
            matches = zoned.getDate() === 1;
          }
        }
        break;
      case 'YEARLY':
        // Jan 1st or first occurrence of the day in January
        if (zoned.getMonth() === 0) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
          } else {
            matches = zoned.getDate() === 1;
          }
        }
        break;
    }

    if (matches) {
      const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
      const eventStart = fromZonedTime(`${dateKey}T${meeting.timeStart}:00`, timezone);
      const eventEnd = fromZonedTime(`${dateKey}T${meeting.timeEnd}:00`, timezone);

      if (eventStart >= rangeStart && eventStart <= rangeEnd) {
        instances.push({ start: eventStart, end: eventEnd });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return instances;
}

/**
 * Check if a user is an attendee or creator of a meeting.
 */
export function isUserInMeeting(meeting: { attendeeIds: unknown; createdById: string }, userId: string): boolean {
  let attendees: string[] = [];
  if (Array.isArray(meeting.attendeeIds)) {
    attendees = meeting.attendeeIds;
  } else if (typeof meeting.attendeeIds === 'string') {
    try { attendees = JSON.parse(meeting.attendeeIds); } catch { /* ignore */ }
  }
  return attendees.includes(userId) || meeting.createdById === userId;
}
