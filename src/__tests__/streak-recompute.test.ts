import { describe, it, expect } from 'vitest';
import { recomputeStreakFromHistory } from '@/lib/streak-recompute';
import { dstSafeDate } from '@/lib/user-timezone';

const TZ = 'America/New_York';

/** Build a Date for `stamp` at noon in `tz` — well clear of midnight boundaries
 *  so DST shifts don't accidentally bump the calendar day during recompute. */
function completionAt(stamp: string, tz: string = TZ): { completedAt: Date } {
  // dstSafeDate gives midnight in tz; add 12h to land at noon. Noon is safer
  // than midnight for tests because the tested helper uses
  // formatInTimeZone(... 'yyyy-MM-dd') which is robust either way, but noon
  // also avoids the DST spring-forward "missing hour" if a future test ever
  // uses an actual midnight-in-tz instant.
  return { completedAt: new Date(dstSafeDate(stamp, tz).getTime() + 12 * 3600 * 1000) };
}

describe('recomputeStreakFromHistory', () => {
  it('returns zero state on empty history', () => {
    const r = recomputeStreakFromHistory([], { tz: TZ, graceDays: false, asOf: dstSafeDate('2026-04-29', TZ) });
    expect(r).toEqual({
      currentCount: 0,
      bestCount: 0,
      lastActiveDate: null,
      lastStamp: null,
      brokenForStaleness: false,
    });
  });

  it('counts a single completion as 1', () => {
    const r = recomputeStreakFromHistory(
      [completionAt('2026-04-28')],
      { tz: TZ, graceDays: false, asOf: dstSafeDate('2026-04-29', TZ) },
    );
    expect(r.currentCount).toBe(1);
    expect(r.bestCount).toBe(1);
    expect(r.lastStamp).toBe('2026-04-28');
    expect(r.brokenForStaleness).toBe(false);
  });

  it('collapses multiple same-day completions to 1 day', () => {
    const day = '2026-04-28';
    const r = recomputeStreakFromHistory(
      [
        { completedAt: new Date(dstSafeDate(day, TZ).getTime() + 9 * 3600 * 1000) },  // 9am
        { completedAt: new Date(dstSafeDate(day, TZ).getTime() + 18 * 3600 * 1000) }, // 6pm
        { completedAt: new Date(dstSafeDate(day, TZ).getTime() + 22 * 3600 * 1000) }, // 10pm
      ],
      { tz: TZ, graceDays: false, asOf: dstSafeDate('2026-04-29', TZ) },
    );
    expect(r.currentCount).toBe(1);
    expect(r.bestCount).toBe(1);
  });

  // The reported bug class — current state should reflect history accurately.
  // Hand-computed expectation:
  //   30-day stretch Apr 1..Apr 30 with one missed day on Apr 15.
  //   With graceDays=false: streak resets on Apr 16 to 1, then climbs
  //     14 more days through Apr 30 → currentCount = 15.
  //   bestCount = max(14 [Apr 1..14], 15 [Apr 16..30]) = 15.
  //   lastStamp = '2026-04-30'.
  it('correctly recomputes a 30-day window with one missed day, no grace', () => {
    const history: { completedAt: Date }[] = [];
    for (let day = 1; day <= 30; day++) {
      if (day === 15) continue; // missed
      const stamp = `2026-04-${String(day).padStart(2, '0')}`;
      history.push(completionAt(stamp));
    }
    const r = recomputeStreakFromHistory(history, {
      tz: TZ,
      graceDays: false,
      asOf: dstSafeDate('2026-05-01', TZ),
    });
    expect(r.currentCount).toBe(15);
    expect(r.bestCount).toBe(15);
    expect(r.lastStamp).toBe('2026-04-30');
    expect(r.brokenForStaleness).toBe(false);
  });

  // With graceDays=true, the effective window is 2 days, so a single missed
  // day is forgiven and the streak does NOT reset. 30 days minus the one
  // skip = 29 actual completions all chained.
  it('respects graceDays: a single missed day does not reset', () => {
    const history: { completedAt: Date }[] = [];
    for (let day = 1; day <= 30; day++) {
      if (day === 15) continue;
      const stamp = `2026-04-${String(day).padStart(2, '0')}`;
      history.push(completionAt(stamp));
    }
    const r = recomputeStreakFromHistory(history, {
      tz: TZ,
      graceDays: true,
      asOf: dstSafeDate('2026-05-01', TZ),
    });
    expect(r.currentCount).toBe(29);
    expect(r.bestCount).toBe(29);
  });

  // Two consecutive missed days exceed even the grace window → reset.
  it('resets when gap exceeds grace window', () => {
    const history: { completedAt: Date }[] = [];
    for (let day = 1; day <= 10; day++) {
      if (day === 5 || day === 6) continue; // two-day gap
      const stamp = `2026-04-${String(day).padStart(2, '0')}`;
      history.push(completionAt(stamp));
    }
    const r = recomputeStreakFromHistory(history, {
      tz: TZ,
      graceDays: true,
      asOf: dstSafeDate('2026-04-11', TZ),
    });
    // First chain: Apr 1..4 = 4 days.
    // Apr 7 has gap of 3 from Apr 4, exceeds window of 2 → reset to 1.
    // Apr 8..10 increments to 4.
    expect(r.currentCount).toBe(4);
    expect(r.bestCount).toBe(4);
  });

  // Streak goes stale: a 5-day chain ending Apr 5, with `asOf` Apr 29, is way
  // outside the 1-day continuation window — currentCount must drop to 0 but
  // bestCount preserves the historical peak.
  it('marks streak broken-for-staleness when asOf is beyond the window', () => {
    const history: { completedAt: Date }[] = [];
    for (let day = 1; day <= 5; day++) {
      const stamp = `2026-04-${String(day).padStart(2, '0')}`;
      history.push(completionAt(stamp));
    }
    const r = recomputeStreakFromHistory(history, {
      tz: TZ,
      graceDays: false,
      asOf: dstSafeDate('2026-04-29', TZ),
    });
    expect(r.brokenForStaleness).toBe(true);
    expect(r.currentCount).toBe(0);
    expect(r.bestCount).toBe(5);
    expect(r.lastStamp).toBe('2026-04-05');
  });

  // Pre-recompute streak might be stuck at a high "current count" because of
  // the bugs we just fixed. Idempotency: running recompute twice on the same
  // input must return identical output.
  it('is idempotent — second run produces identical output', () => {
    const history: { completedAt: Date }[] = [];
    for (let day = 10; day <= 28; day++) {
      const stamp = `2026-04-${String(day).padStart(2, '0')}`;
      history.push(completionAt(stamp));
    }
    const opts = { tz: TZ, graceDays: false, asOf: dstSafeDate('2026-04-29', TZ) };
    const a = recomputeStreakFromHistory(history, opts);
    const b = recomputeStreakFromHistory(history, opts);
    expect(a).toEqual(b);
  });

  // Spring-forward DST regression — the gap from Mar 7 to Mar 8 in
  // America/New_York is 23 wall hours, but it's still 1 calendar day. The
  // recompute logic uses YYYY-MM-DD stamps with UTC arithmetic so DST is
  // invisible.
  it('treats DST spring-forward as a single calendar-day gap', () => {
    const history = [
      completionAt('2026-03-07'),
      completionAt('2026-03-08'),
    ];
    const r = recomputeStreakFromHistory(history, {
      tz: TZ,
      graceDays: false,
      asOf: dstSafeDate('2026-03-09', TZ),
    });
    expect(r.currentCount).toBe(2);
    expect(r.bestCount).toBe(2);
  });
});
