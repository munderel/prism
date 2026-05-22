import { describe, it, expect } from 'vitest';
import {
  STREAK_MILESTONES,
  isStreakMilestoneDay,
  isWeekCrossingDay,
} from '@/lib/heatmap-utils';

// Bitmask convention (matches UserAim.activeWeekdays):
// Sun=1 Mon=2 Tue=4 Wed=8 Thu=16 Fri=32 Sat=64 → all-days = 127
const EVERY_DAY = 127;
const WEEKDAYS_ONLY = 0b0111110; // Mon..Fri = 62

function makeHistory(dates: string[]): { date: string; completed: boolean }[] {
  return dates.map((date) => ({ date, completed: true }));
}

describe('STREAK_MILESTONES', () => {
  it('includes the canonical milestone counts', () => {
    expect(STREAK_MILESTONES).toContain(7);
    expect(STREAK_MILESTONES).toContain(14);
    expect(STREAK_MILESTONES).toContain(30);
    expect(STREAK_MILESTONES).toContain(60);
    expect(STREAK_MILESTONES).toContain(100);
  });
});

describe('isStreakMilestoneDay', () => {
  it('is true on the 7th consecutive completed active day', () => {
    const history = makeHistory([
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16', '2026-05-17',
    ]);
    expect(isStreakMilestoneDay(history, EVERY_DAY, '2026-05-17')).toBe(true);
  });

  it('is false on the 6th day (not a milestone)', () => {
    const history = makeHistory([
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16',
    ]);
    expect(isStreakMilestoneDay(history, EVERY_DAY, '2026-05-16')).toBe(false);
  });

  it('is true on day 14 when the streak is 14', () => {
    const dates: string[] = [];
    const start = new Date(2026, 4, 4); // May 4, 2026 (Mon)
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dates.push(key);
    }
    expect(isStreakMilestoneDay(makeHistory(dates), EVERY_DAY, dates[13])).toBe(true);
  });

  it('skips inactive weekdays without breaking the streak', () => {
    // Weekdays-only AIM. The 7th consecutive completed active day is w2 Tue.
    const dates = [
      '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', // w1 Mon-Fri
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', // w2 Mon-Fri
    ];
    expect(isStreakMilestoneDay(makeHistory(dates), WEEKDAYS_ONLY, '2026-05-12')).toBe(true);
  });

  it('is false when an active day was missed before the target', () => {
    const history = makeHistory([
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16',
      // 2026-05-17 missed (active day, no completion)
      '2026-05-18', '2026-05-19',
    ]);
    expect(isStreakMilestoneDay(history, EVERY_DAY, '2026-05-19')).toBe(false);
  });

  it('is false when the target date itself was not completed', () => {
    const history = makeHistory([
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16',
    ]);
    expect(isStreakMilestoneDay(history, EVERY_DAY, '2026-05-17')).toBe(false);
  });

  it('returns false when activeWeekdays is 0', () => {
    const history = makeHistory(['2026-05-17']);
    expect(isStreakMilestoneDay(history, 0, '2026-05-17')).toBe(false);
  });
});

describe('isWeekCrossingDay', () => {
  // ISO week 2026-W19 contains Mon 2026-05-04 .. Sun 2026-05-10
  it('is true on the day that pushes the week count above the target', () => {
    // weeklyTarget = 3 → gold day is the 4th completion of the week.
    const history = makeHistory([
      '2026-05-04', // 1
      '2026-05-05', // 2
      '2026-05-06', // 3 (meets target, not exceeds)
      '2026-05-07', // 4 (FIRST to exceed → gold)
      '2026-05-08', // 5 (already past gold)
    ]);
    expect(isWeekCrossingDay(history, 3, '2026-05-07')).toBe(true);
  });

  it('is false on days before the crossing', () => {
    const history = makeHistory([
      '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08',
    ]);
    expect(isWeekCrossingDay(history, 3, '2026-05-06')).toBe(false);
    expect(isWeekCrossingDay(history, 3, '2026-05-05')).toBe(false);
    expect(isWeekCrossingDay(history, 3, '2026-05-04')).toBe(false);
  });

  it('is false on days after the crossing within the same week', () => {
    const history = makeHistory([
      '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08',
    ]);
    expect(isWeekCrossingDay(history, 3, '2026-05-08')).toBe(false);
  });

  it('is false when the week never crosses the target', () => {
    const history = makeHistory(['2026-05-04', '2026-05-05', '2026-05-06']);
    expect(isWeekCrossingDay(history, 3, '2026-05-06')).toBe(false);
  });

  it('returns false when weeklyTarget <= 0', () => {
    const history = makeHistory(['2026-05-07']);
    expect(isWeekCrossingDay(history, 0, '2026-05-07')).toBe(false);
    expect(isWeekCrossingDay(history, -1, '2026-05-07')).toBe(false);
  });

  it('respects ISO-week boundaries (Monday start)', () => {
    // Sun 2026-05-10 belongs to ISO week 2026-W19. Mon 2026-05-11 starts W20.
    const history = makeHistory(['2026-05-11', '2026-05-12', '2026-05-13']);
    expect(isWeekCrossingDay(history, 1, '2026-05-11')).toBe(false); // meets
    expect(isWeekCrossingDay(history, 1, '2026-05-12')).toBe(true);  // exceeds
    expect(isWeekCrossingDay(history, 1, '2026-05-13')).toBe(false); // already exceeded
  });
});
