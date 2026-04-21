import { describe, it, expect } from 'vitest';
import {
  toUserDayStamp,
  dstSafeDate,
  weekBoundariesForUser,
  dayBoundariesForUser,
} from '@/lib/user-timezone';

describe('toUserDayStamp', () => {
  it('returns user-local YYYY-MM-DD even when UTC is on the next day', () => {
    // 2026-03-29T02:00:00Z = 2026-03-28 22:00 in America/New_York (EDT, UTC-4)
    const utc = new Date('2026-03-29T02:00:00Z');
    expect(toUserDayStamp(utc, 'America/New_York')).toBe('2026-03-28');
  });

  it('returns same day for UTC itself', () => {
    const utc = new Date('2026-03-29T12:00:00Z');
    expect(toUserDayStamp(utc, 'UTC')).toBe('2026-03-29');
  });

  it('shifts forward for east-of-UTC zones when UTC is late', () => {
    // 2026-03-29T23:30:00Z = 2026-03-30 08:30 in Asia/Tokyo (UTC+9)
    const utc = new Date('2026-03-29T23:30:00Z');
    expect(toUserDayStamp(utc, 'Asia/Tokyo')).toBe('2026-03-30');
  });
});

describe('dstSafeDate', () => {
  it('parses YYYY-MM-DD as midnight in the named tz, not server tz', () => {
    // 2026-01-15 midnight America/New_York (EST, UTC-5) = 2026-01-15T05:00:00Z
    const d = dstSafeDate('2026-01-15', 'America/New_York');
    expect(d.toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('handles DST spring-forward (no 2am exists on 2026-03-08 in NY)', () => {
    // On DST-forward day, midnight exists normally; the jump is at 2am.
    // Midnight 2026-03-08 EST = 05:00Z
    const d = dstSafeDate('2026-03-08', 'America/New_York');
    expect(d.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('handles DST fall-back (midnight is unambiguous)', () => {
    const d = dstSafeDate('2026-11-01', 'America/New_York');
    // Midnight 2026-11-01 is still EDT (fall-back is at 2am), so 04:00Z
    expect(d.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('works for UTC', () => {
    const d = dstSafeDate('2026-06-15', 'UTC');
    expect(d.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => dstSafeDate('2026-3-8', 'UTC')).toThrow();
    expect(() => dstSafeDate('nope', 'UTC')).toThrow();
  });
});

describe('weekBoundariesForUser', () => {
  it('Sunday-start: 2026-03-31 (Tue) in NY -> Sun 2026-03-29..Sun 2026-04-05', () => {
    // Tuesday 2026-03-31 at noon NY (UTC-4 EDT) = 2026-03-31T16:00Z
    const at = new Date('2026-03-31T16:00:00Z');
    const { start, end } = weekBoundariesForUser(at, 'America/New_York', 0);
    expect(start.toISOString()).toBe('2026-03-29T04:00:00.000Z'); // Sun midnight NY
    expect(end.toISOString()).toBe('2026-04-05T04:00:00.000Z'); // Sun midnight NY (half-open)
  });

  it('Monday-start yields a Mon..Mon half-open range', () => {
    const at = new Date('2026-03-31T16:00:00Z'); // Tue
    const { start, end } = weekBoundariesForUser(at, 'America/New_York', 1);
    expect(start.toISOString()).toBe('2026-03-30T04:00:00.000Z'); // Mon
    expect(end.toISOString()).toBe('2026-04-06T04:00:00.000Z'); // next Mon
  });

  it('user west of UTC, instant after their local midnight still reports today', () => {
    // 2026-06-08T07:00Z = 2026-06-08 00:00 America/Los_Angeles (PDT, UTC-7)
    const at = new Date('2026-06-08T07:00:00Z');
    const { start } = weekBoundariesForUser(at, 'America/Los_Angeles', 1);
    // Mon 2026-06-08 midnight LA = 07:00Z (that's `at` itself)
    expect(start.toISOString()).toBe('2026-06-08T07:00:00.000Z');
  });

  it('rejects invalid weekStartDay', () => {
    expect(() => weekBoundariesForUser(new Date(), 'UTC', 7)).toThrow();
    expect(() => weekBoundariesForUser(new Date(), 'UTC', -1)).toThrow();
  });
});

describe('dayBoundariesForUser', () => {
  it('spans user local midnight to midnight, half-open', () => {
    const at = new Date('2026-03-29T14:00:00Z'); // 10am NY
    const { start, end } = dayBoundariesForUser(at, 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-29T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-30T04:00:00.000Z');
  });

  it('DST spring-forward day is still a single half-open user day', () => {
    // 2026-03-08 is DST forward day in NY (2am -> 3am). Day spans 23 hours UTC.
    const at = new Date('2026-03-08T14:00:00Z');
    const { start, end } = dayBoundariesForUser(at, 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z'); // EST midnight
    expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z'); // EDT midnight (23h later)
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});
