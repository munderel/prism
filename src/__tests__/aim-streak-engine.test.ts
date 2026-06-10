import { describe, it, expect } from 'vitest';
import { isDayActive, computeDailyStreak, computeWeeklyStreak } from '@/lib/aim-streak-engine';
import type { AimInstanceRow } from '@/lib/aim-streak-engine';

// ---------------------------------------------------------------------------
// isDayActive
// ---------------------------------------------------------------------------

describe('isDayActive', () => {
  it('returns true for Sunday (bit 0) when bitmask=127', () => {
    expect(isDayActive(127, 0)).toBe(true);
  });

  it('returns true for Saturday (bit 6) when bitmask=127', () => {
    expect(isDayActive(127, 6)).toBe(true);
  });

  it('returns false for Sunday when bitmask=62 (Mon–Fri)', () => {
    // Mon=2|Tue=4|Wed=8|Thu=16|Fri=32 = 62; Sun=1 not set
    expect(isDayActive(62, 0)).toBe(false);
  });

  it('returns false for Saturday when bitmask=62 (Mon–Fri)', () => {
    expect(isDayActive(62, 6)).toBe(false);
  });

  it('returns true for Monday (bit 1) when bitmask=62', () => {
    expect(isDayActive(62, 1)).toBe(true);
  });

  it('returns false for all days when bitmask=0', () => {
    for (let d = 0; d <= 6; d++) {
      expect(isDayActive(0, d as 0 | 1 | 2 | 3 | 4 | 5 | 6)).toBe(false);
    }
  });

  it('handles weekend-only bitmask (Sun=1, Sat=64 => 65)', () => {
    expect(isDayActive(65, 0)).toBe(true);  // Sunday
    expect(isDayActive(65, 6)).toBe(true);  // Saturday
    expect(isDayActive(65, 1)).toBe(false); // Monday
  });
});

// ---------------------------------------------------------------------------
// computeDailyStreak
// ---------------------------------------------------------------------------

/** Build a completed instance row with the given YYYY-MM-DD scheduledDate. */
function completed(scheduledDate: string): AimInstanceRow {
  return { scheduledDate, completedAt: new Date(), status: 'COMPLETED' };
}

/** Build an uncompleted instance row. */
function scheduled(scheduledDate: string): AimInstanceRow {
  return { scheduledDate, completedAt: null, status: 'SCHEDULED' };
}

/** Build a SKIPPED instance row (vacation day — bridges but doesn't increment). */
function skipped(scheduledDate: string): AimInstanceRow {
  return { scheduledDate, completedAt: null, status: 'SKIPPED' };
}

/** Build a MISSED instance row (breaks the streak). */
function missed(scheduledDate: string): AimInstanceRow {
  return { scheduledDate, completedAt: null, status: 'MISSED' };
}

describe('computeDailyStreak', () => {
  it('returns 0 for an empty instance list', () => {
    // asOf = Wednesday 2026-05-20
    const asOf = new Date(2026, 4, 20); // month is 0-indexed
    const result = computeDailyStreak([], 127, asOf);
    expect(result.currentStreak).toBe(0);
  });

  it('returns 0 when activeWeekdays = 0', () => {
    const asOf = new Date(2026, 4, 20);
    const result = computeDailyStreak([completed('2026-05-20')], 0, asOf);
    expect(result.currentStreak).toBe(0);
  });

  it('counts a single completed day (today)', () => {
    // Wednesday 2026-05-20, all days active
    const asOf = new Date(2026, 4, 20);
    const result = computeDailyStreak([completed('2026-05-20')], 127, asOf);
    expect(result.currentStreak).toBe(1);
  });

  it('counts consecutive completed days', () => {
    // asOf = Wednesday May 20; completed Mon, Tue, Wed (all 7 active)
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      completed('2026-05-20'), // Wed
    ];
    const result = computeDailyStreak(instances, 127, asOf);
    expect(result.currentStreak).toBe(3);
  });

  it('breaks when an active day has no completion', () => {
    // asOf = Wednesday May 20; Tuesday is missing
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      // Tue May 19 missing — streak breaks here going backwards
      completed('2026-05-20'), // Wed
    ];
    const result = computeDailyStreak(instances, 127, asOf);
    expect(result.currentStreak).toBe(1); // only today (Wed) counts
  });

  it('M-F bitmask: skipping Saturday does NOT break the streak', () => {
    // asOf = Monday May 18; active days are Mon–Fri (bitmask=62)
    // The streak should include last Friday and Monday, bridging across Saturday/Sunday
    const asOf = new Date(2026, 4, 18); // Monday
    const instances = [
      completed('2026-05-15'), // Friday
      // Saturday + Sunday are inactive days — they skip, not break
      completed('2026-05-18'), // Monday
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // Mon–Fri = 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    // Should be 2: Mon + Fri counted; Sat/Sun skipped
    expect(result.currentStreak).toBe(2);
  });

  it('M-F bitmask: missing a Friday breaks the streak', () => {
    // asOf = Monday May 18
    const asOf = new Date(2026, 4, 18); // Monday
    const instances = [
      // Friday May 15 missing
      completed('2026-05-14'), // Thursday — before the gap
      completed('2026-05-18'), // Monday
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    // Walking back from Mon: Mon ✓ (streak=1); Sun inactive (skip); Sat inactive (skip);
    // Fri missing (break). Streak = 1.
    expect(result.currentStreak).toBe(1);
  });

  it('handles a mix of completed and uncompleted instances on active days', () => {
    const asOf = new Date(2026, 4, 20); // Wednesday
    const instances = [
      completed('2026-05-20'), // Wed ✓
      scheduled('2026-05-19'), // Tue — not completed (has a row but completedAt=null)
      completed('2026-05-18'), // Mon ✓
    ];
    const result = computeDailyStreak(instances, 127, asOf);
    // Wed ✓, Tue × (active, no completion) → streak breaks at Tue = 1
    expect(result.currentStreak).toBe(1);
  });

  // -------------------------------------------------------------------------
  // SKIPPED vs MISSED semantics (vacation-day rule) — Partial 6
  // -------------------------------------------------------------------------

  it('SKIPPED on an active day bridges the streak like an inactive day', () => {
    // asOf = Wednesday May 20; M-F aim, Tue=SKIPPED, Mon+Wed=COMPLETED
    const asOf = new Date(2026, 4, 20); // Wednesday
    const instances = [
      completed('2026-05-18'), // Mon ✓
      skipped('2026-05-19'),   // Tue — vacation day, bridges
      completed('2026-05-20'), // Wed ✓
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    // Wed ✓ (streak=1), Tue skipped (bridge), Mon ✓ (streak=2)
    expect(result.currentStreak).toBe(2);
  });

  it('MISSED on an active day breaks the streak', () => {
    // asOf = Wednesday May 20; M-F aim, Tue=MISSED, Mon+Wed=COMPLETED
    const asOf = new Date(2026, 4, 20); // Wednesday
    const instances = [
      completed('2026-05-18'), // Mon ✓ (won't be reached — break before)
      missed('2026-05-19'),    // Tue ✗ — breaks the streak
      completed('2026-05-20'), // Wed ✓
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    // Wed ✓ (streak=1), Tue MISSED → break. Streak=1.
    expect(result.currentStreak).toBe(1);
  });

  it('three consecutive COMPLETED days → streak = 3', () => {
    const asOf = new Date(2026, 4, 20); // Wednesday
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      completed('2026-05-20'), // Wed
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    expect(result.currentStreak).toBe(3);
  });

  it('today=SKIPPED bridges but does not itself count: streak = 2 from prior 2 COMPLETED', () => {
    // asOf = Wednesday; Wed=SKIPPED (today), Mon+Tue=COMPLETED
    const asOf = new Date(2026, 4, 20); // Wednesday
    const instances = [
      completed('2026-05-18'), // Mon ✓
      completed('2026-05-19'), // Tue ✓
      skipped('2026-05-20'),   // Wed — bridges (doesn't itself count)
    ];
    const MF_MASK = 2 | 4 | 8 | 16 | 32; // 62
    const result = computeDailyStreak(instances, MF_MASK, asOf);
    // Wed skipped (bridge, no increment), Tue ✓ (1), Mon ✓ (2)
    expect(result.currentStreak).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyStreak
// ---------------------------------------------------------------------------

describe('computeWeeklyStreak', () => {
  it('returns 0 streak and 0 gold for empty instance list', () => {
    const asOf = new Date(2026, 4, 20);
    const result = computeWeeklyStreak([], 3, asOf);
    expect(result.currentStreak).toBe(0);
    expect(result.goldWeeks).toBe(0);
  });

  it('returns 0 streak when weeklyTarget <= 0', () => {
    const asOf = new Date(2026, 4, 20);
    const result = computeWeeklyStreak([completed('2026-05-20')], 0, asOf);
    expect(result.currentStreak).toBe(0);
    expect(result.goldWeeks).toBe(0);
  });

  it('target=3: 2 completions in current week = red (no streak)', () => {
    // ISO week containing May 20 starts Mon May 18
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue — only 2 this week
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(0);
    expect(result.goldWeeks).toBe(0);
  });

  it('target=3: 3 completions in current week = green (streak=1)', () => {
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      completed('2026-05-20'), // Wed — exactly 3
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(1);
    expect(result.goldWeeks).toBe(0);
  });

  it('target=3: 5 completions in current week = gold (streak=1, goldWeeks=1)', () => {
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      completed('2026-05-20'), // Wed
      completed('2026-05-21'), // Thu
      completed('2026-05-22'), // Fri — 5 total, > 3
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(1);
    expect(result.goldWeeks).toBe(1);
  });

  it('consecutive hit weeks extend the streak', () => {
    // asOf = May 20 (week of May 18)
    // Previous week: May 11–17 → 3 completions
    // Current week:  May 18–24 → 3 completions
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-11'), // prev week Mon
      completed('2026-05-12'), // prev week Tue
      completed('2026-05-13'), // prev week Wed
      completed('2026-05-18'), // curr week Mon
      completed('2026-05-19'), // curr week Tue
      completed('2026-05-20'), // curr week Wed
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(2);
  });

  it('REGRESSION: an in-progress current week below target does NOT collapse a prior-week streak', () => {
    // asOf = Mon May 18 (start of current week, 0 completions yet).
    // Last week (May 11–17) hit the target (3). The streak should remain 1,
    // not reset to 0 just because the new week has not been filled yet.
    const asOf = new Date(2026, 4, 18); // Monday
    const instances = [
      completed('2026-05-11'),
      completed('2026-05-12'),
      completed('2026-05-13'),
      // current week (May 18–24): nothing completed yet
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(1);
  });

  it('a miss in a prior week breaks the streak', () => {
    // Current week: hit; two-weeks-ago: hit; last week: miss
    const asOf = new Date(2026, 4, 20); // May 20
    const instances = [
      // Two weeks ago (May 4–10): 3 completions
      completed('2026-05-04'),
      completed('2026-05-05'),
      completed('2026-05-06'),
      // Last week (May 11–17): only 2 (miss)
      completed('2026-05-11'),
      completed('2026-05-12'),
      // Current week (May 18–24): 3 completions
      completed('2026-05-18'),
      completed('2026-05-19'),
      completed('2026-05-20'),
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    // Walking back: current week hit (streak=1), last week miss → stops
    expect(result.currentStreak).toBe(1);
  });

  // -------------------------------------------------------------------------
  // SKIPPED vs MISSED semantics (vacation-day rule) — Partial 6
  // -------------------------------------------------------------------------

  it('target=3: 3 COMPLETED + 1 SKIPPED → week satisfied (streak=1)', () => {
    const asOf = new Date(2026, 4, 20); // Wed May 20
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      skipped('2026-05-20'),   // Wed — neutral
      completed('2026-05-21'), // Thu — third completion
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(1);
    expect(result.goldWeeks).toBe(0);
  });

  it('target=3: 2 COMPLETED + 1 SKIPPED + 1 MISSED → week NOT satisfied (streak=0)', () => {
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue — only 2 completions
      skipped('2026-05-20'),   // Wed — neutral, does not count
      missed('2026-05-21'),    // Thu — does not count
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(0);
    expect(result.goldWeeks).toBe(0);
  });

  it('target=3: exactly 3 COMPLETED and no SKIPPED/MISSED → satisfied (streak=1)', () => {
    const asOf = new Date(2026, 4, 20);
    const instances = [
      completed('2026-05-18'), // Mon
      completed('2026-05-19'), // Tue
      completed('2026-05-20'), // Wed
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(1);
    expect(result.goldWeeks).toBe(0);
  });

  it('gold weeks count correctly across multiple weeks', () => {
    const asOf = new Date(2026, 4, 20);
    const instances = [
      // Last week: 4 (gold)
      completed('2026-05-11'),
      completed('2026-05-12'),
      completed('2026-05-13'),
      completed('2026-05-14'),
      // Current week: 5 (gold)
      completed('2026-05-18'),
      completed('2026-05-19'),
      completed('2026-05-20'),
      completed('2026-05-21'),
      completed('2026-05-22'),
    ];
    const result = computeWeeklyStreak(instances, 3, asOf);
    expect(result.currentStreak).toBe(2);
    expect(result.goldWeeks).toBe(2);
  });
});
