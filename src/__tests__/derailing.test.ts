import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkTaskDerailStatus, checkStreakAtRisk, computeDerailInfo, type UserAimLike } from '../lib/derailing';

const tz = 'America/New_York';

function makeUserAim(overrides: Partial<UserAimLike> = {}): UserAimLike {
  return {
    isActive: true,
    customFrequency: null,
    customDuration: null,
    currentPhase: 'FLOW',
    phaseStartedAt: new Date('2025-01-01'),
    derailSensitivityDays: 1,
    aimCategory: { isDaily: true, defaultFrequency: 7, defaultDurationMin: 30 },
    ...overrides,
  };
}

describe('checkTaskDerailStatus', () => {
  it('returns ok for DONE tasks', () => {
    expect(checkTaskDerailStatus({ status: 'DONE', dueDate: new Date() }, tz)).toBe('ok');
  });

  it('returns ok for DROPPED tasks', () => {
    expect(checkTaskDerailStatus({ status: 'DROPPED', dueDate: new Date() }, tz)).toBe('ok');
  });

  it('returns ok for tasks with no due date', () => {
    expect(checkTaskDerailStatus({ status: 'TODO', dueDate: null }, tz)).toBe('ok');
  });

  it('returns ok for tasks due on a different day', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(checkTaskDerailStatus({ status: 'TODO', dueDate: tomorrow }, tz)).toBe('ok');
  });

  // Regression guard for the date-only UTC-midnight bug: a plain due-date task
  // (stored at UTC midnight) due "today" in the user's local tz must reach
  // at_risk/derailing. The old toZonedTime(dueDate) same-day check rolled these
  // back a day for any timezone west of UTC and silently suppressed all alerts.
  describe('date-only dueDate (UTC midnight) — timezone regression', () => {
    afterEach(() => vi.useRealTimers());

    // EDT (May) is UTC-4: 23:00Z = 19:00 local, 18:30Z = 14:30 local, 15:00Z = 11:00 local.
    const dateOnlyToday = '2026-05-30T00:00:00.000Z';

    it('derails a date-only task due today past 6pm local', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-30T23:00:00.000Z')); // 19:00 EDT
      expect(checkTaskDerailStatus({ status: 'TODO', dueDate: dateOnlyToday }, tz)).toBe('derailing');
      expect(checkTaskDerailStatus({ status: 'IN_PROGRESS', dueDate: dateOnlyToday }, tz)).toBe('derailing');
    });

    it('flags at_risk for a date-only TODO due today past 2pm local', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-30T18:30:00.000Z')); // 14:30 EDT
      expect(checkTaskDerailStatus({ status: 'TODO', dueDate: dateOnlyToday }, tz)).toBe('at_risk');
    });

    it('stays ok before 2pm local', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-30T15:00:00.000Z')); // 11:00 EDT
      expect(checkTaskDerailStatus({ status: 'TODO', dueDate: dateOnlyToday }, tz)).toBe('ok');
    });
  });
});

describe('checkStreakAtRisk', () => {
  it('returns false when there are completions today', () => {
    expect(checkStreakAtRisk(3, tz)).toBe(false);
  });
});

describe('computeDerailInfo', () => {
  it('counts completions using timezone-aware date keys', () => {
    // An instance scheduled at 11pm EDT (03:00 UTC next day).
    // Without timezone handling, the UTC date would be the next day,
    // causing it to not count toward the correct date.
    const userAim = makeUserAim({ aimCategory: { isDaily: false, defaultFrequency: 1, defaultDurationMin: 30 } });

    // Create instances that span the 14-day window with enough completions
    // to be on_track. Use dates that would shift across UTC day boundaries.
    const instances = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      // Set to 11pm EDT = 03:00 UTC next day
      d.setUTCHours(3, 0, 0, 0);
      instances.push({
        status: 'COMPLETED',
        scheduledDate: d.toISOString(),
        completedAt: d.toISOString(),
      });
    }

    const result = computeDerailInfo(userAim, instances, 14, 'America/New_York');
    // With timezone-aware counting, all 14 completions should be counted
    // as distinct days, giving a high completion rate
    expect(result.status).toBe('on_track');
  });

  it('returns on_track for a daily aim completed today', () => {
    const userAim = makeUserAim();
    const today = new Date();
    const instances = [];

    // Fill 14-day window with daily completions
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      instances.push({
        status: 'COMPLETED',
        scheduledDate: d.toISOString(),
        completedAt: d.toISOString(),
      });
    }

    const result = computeDerailInfo(userAim, instances, 14, 'America/New_York');
    expect(result.status).toBe('on_track');
    expect(result.completionRate).toBe(1);
  });

  it('returns derailing when no completions in window', () => {
    const userAim = makeUserAim();
    const result = computeDerailInfo(userAim, [], 14, 'America/New_York');
    expect(result.status).toBe('derailing');
    expect(result.completionRate).toBe(0);
  });

  it('returns on_track for paused aim regardless of completions', () => {
    const userAim = makeUserAim({ isActive: false });
    const result = computeDerailInfo(userAim, [], 14, 'America/New_York');
    expect(result.status).toBe('on_track');
  });
});
