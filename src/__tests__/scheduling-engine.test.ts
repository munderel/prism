import { describe, it, expect, vi } from 'vitest';
import {
  autoSchedule,
  rearrangeFlexible,
  parseTime,
  getEndOfWeek,
  setTimeOnDate,
  getDaysBetween,
  findSlotInRange,
  type SchedulableTask,
  type CalendarEvent,
  type WorkingHours,
} from '@/lib/scheduling-engine';

const defaultWorkingHours: WorkingHours = { start: '06:00', end: '22:00' };

// Fixed "today" for deterministic tests — a Wednesday
const TODAY = new Date('2026-03-25T08:00:00');

// ---------- helper unit tests ----------

describe('parseTime', () => {
  it('parses "06:00"', () => {
    expect(parseTime('06:00')).toEqual({ hours: 6, minutes: 0 });
  });
  it('parses "14:30"', () => {
    expect(parseTime('14:30')).toEqual({ hours: 14, minutes: 30 });
  });
});

describe('getEndOfWeek', () => {
  it('returns next Sunday 23:59:59 for a Wednesday', () => {
    const end = getEndOfWeek(TODAY);
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    // Should be Sunday March 29, 2026
    expect(end.getDate()).toBe(29);
    expect(end.getMonth()).toBe(2); // March
  });

  it('returns same Sunday if today is Sunday', () => {
    const sunday = new Date('2026-03-29T10:00:00');
    const end = getEndOfWeek(sunday);
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(29);
  });
});

describe('setTimeOnDate', () => {
  it('sets hours and minutes on a date', () => {
    const result = setTimeOnDate(new Date('2026-03-25T00:00:00'), '14:30');
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('getDaysBetween', () => {
  it('returns each day from start to end inclusive', () => {
    const start = new Date('2026-03-25T00:00:00');
    const end = new Date('2026-03-27T23:59:59');
    const days = getDaysBetween(start, end);
    expect(days).toHaveLength(3);
    expect(days[0].getDate()).toBe(25);
    expect(days[1].getDate()).toBe(26);
    expect(days[2].getDate()).toBe(27);
  });
});

describe('findSlotInRange', () => {
  it('returns start of range when no occupied slots', () => {
    const day = new Date('2026-03-25T00:00:00');
    const rangeStart = setTimeOnDate(day, '06:00');
    const rangeEnd = setTimeOnDate(day, '22:00');
    const durationMs = 60 * 60 * 1000; // 60 min
    const slot = findSlotInRange(day, rangeStart, rangeEnd, durationMs, []);
    expect(slot).not.toBeNull();
    expect(slot!.getHours()).toBe(6);
    expect(slot!.getMinutes()).toBe(0);
  });

  it('returns null when range is too small', () => {
    const day = new Date('2026-03-25T00:00:00');
    const rangeStart = setTimeOnDate(day, '06:00');
    const rangeEnd = setTimeOnDate(day, '06:30');
    const durationMs = 60 * 60 * 1000; // 60 min — won't fit in 30 min range
    const slot = findSlotInRange(day, rangeStart, rangeEnd, durationMs, []);
    expect(slot).toBeNull();
  });

  it('skips occupied blocks', () => {
    const day = new Date('2026-03-25T00:00:00');
    const rangeStart = setTimeOnDate(day, '06:00');
    const rangeEnd = setTimeOnDate(day, '22:00');
    const durationMs = 60 * 60 * 1000; // 60 min
    const occupied: CalendarEvent[] = [
      { start: setTimeOnDate(day, '06:00'), end: setTimeOnDate(day, '07:00') },
    ];
    const slot = findSlotInRange(day, rangeStart, rangeEnd, durationMs, occupied);
    expect(slot).not.toBeNull();
    expect(slot!.getHours()).toBe(7);
    expect(slot!.getMinutes()).toBe(0);
  });
});

// ---------- autoSchedule integration tests ----------

describe('autoSchedule', () => {
  it('schedules a single task into first available slot (6am)', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Write report',
        estimatedMinutes: 60,
        priority: 'MEDIUM',
        dueDate: new Date('2026-03-27T23:59:59'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    const result = autoSchedule(tasks, [], defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('t1');
    expect(result[0].start.getHours()).toBe(6);
    expect(result[0].start.getMinutes()).toBe(0);
    // Duration should be 60 minutes
    const durationMin = (result[0].end.getTime() - result[0].start.getTime()) / 60000;
    expect(durationMin).toBe(60);
  });

  it('sorts by priority DESC then dueDate ASC', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 'low',
        title: 'Low',
        estimatedMinutes: 30,
        priority: 'LOW',
        dueDate: new Date('2026-03-26T00:00:00'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
      {
        id: 'urgent',
        title: 'Urgent',
        estimatedMinutes: 30,
        priority: 'URGENT',
        dueDate: new Date('2026-03-28T00:00:00'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
      {
        id: 'high-late',
        title: 'High late',
        estimatedMinutes: 30,
        priority: 'HIGH',
        dueDate: new Date('2026-03-28T00:00:00'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
      {
        id: 'high-early',
        title: 'High early',
        estimatedMinutes: 30,
        priority: 'HIGH',
        dueDate: new Date('2026-03-26T00:00:00'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    const result = autoSchedule(tasks, [], defaultWorkingHours, TODAY);

    // Urgent first, then High-early (earlier due), then High-late, then Low
    expect(result.map((s) => s.taskId)).toEqual(['urgent', 'high-early', 'high-late', 'low']);
  });

  it('avoids overlapping existing events', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Task',
        estimatedMinutes: 60,
        priority: 'MEDIUM',
        dueDate: new Date('2026-03-27T23:59:59'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    // Block 6:00-8:00
    const events: CalendarEvent[] = [
      {
        start: new Date('2026-03-25T06:00:00'),
        end: new Date('2026-03-25T08:00:00'),
      },
    ];

    const result = autoSchedule(tasks, events, defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].start.getHours()).toBe(8);
  });

  it('respects preferred time window', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Focus work',
        estimatedMinutes: 60,
        priority: 'MEDIUM',
        dueDate: new Date('2026-03-27T23:59:59'),
        preferredTimeStart: '14:00',
        preferredTimeEnd: '16:00',
      },
    ];

    const result = autoSchedule(tasks, [], defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].start.getHours()).toBe(14);
    expect(result[0].start.getMinutes()).toBe(0);
  });

  it('falls back to any working-hours slot if preferred time is full', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Focus work',
        estimatedMinutes: 60,
        priority: 'MEDIUM',
        dueDate: new Date('2026-03-25T23:59:59'), // only today
        preferredTimeStart: '14:00',
        preferredTimeEnd: '15:00',
      },
    ];

    // Block 14:00-15:00 on March 25
    const events: CalendarEvent[] = [
      {
        start: new Date('2026-03-25T14:00:00'),
        end: new Date('2026-03-25T15:00:00'),
      },
    ];

    const result = autoSchedule(tasks, events, defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    // Should NOT be at 14:00 (blocked), should be somewhere else within working hours
    expect(result[0].start.getHours()).not.toBe(14);
    expect(result[0].start.getHours()).toBeGreaterThanOrEqual(6);
    expect(result[0].end.getHours()).toBeLessThanOrEqual(22);
  });

  it('uses end of current week for tasks with no dueDate', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Someday task',
        estimatedMinutes: 30,
        priority: 'LOW',
        dueDate: null,
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    const result = autoSchedule(tasks, [], defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    // Scheduled within this week (today through Sunday)
    const endOfWeek = getEndOfWeek(TODAY);
    expect(result[0].end.getTime()).toBeLessThanOrEqual(endOfWeek.getTime());
  });

  it('returns empty array if no slot available', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 't1',
        title: 'Long task',
        estimatedMinutes: 960, // 16 hours — exactly fills 6:00-22:00
        priority: 'HIGH',
        dueDate: new Date('2026-03-25T23:59:59'), // only today
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    // Block the entire working day
    const events: CalendarEvent[] = [
      {
        start: new Date('2026-03-25T06:00:00'),
        end: new Date('2026-03-25T22:00:00'),
      },
    ];

    const result = autoSchedule(tasks, events, defaultWorkingHours, TODAY);

    expect(result).toHaveLength(0);
  });
});

// ---------- rearrangeFlexible ----------

describe('rearrangeFlexible', () => {
  it('delegates to autoSchedule correctly', () => {
    const tasks: SchedulableTask[] = [
      {
        id: 'flex1',
        title: 'Flexible task',
        estimatedMinutes: 45,
        priority: 'HIGH',
        dueDate: new Date('2026-03-27T23:59:59'),
        preferredTimeStart: null,
        preferredTimeEnd: null,
      },
    ];

    const fixedEvents: CalendarEvent[] = [
      {
        start: new Date('2026-03-25T09:00:00'),
        end: new Date('2026-03-25T10:00:00'),
      },
    ];

    const result = rearrangeFlexible(tasks, fixedEvents, defaultWorkingHours, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('flex1');
    // Should be scheduled at 6:00 (first available, not conflicting with 9-10)
    expect(result[0].start.getHours()).toBe(6);
    const durationMin = (result[0].end.getTime() - result[0].start.getTime()) / 60000;
    expect(durationMin).toBe(45);
  });
});
