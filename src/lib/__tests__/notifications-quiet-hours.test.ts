import { describe, it, expect } from 'vitest';
import { isInQuietHours } from '@/lib/notifications';

/**
 * Helper to build a fixed UTC instant we can hand to `isInQuietHours`.
 * Using `new Date(Date.UTC(...))` avoids the parseLocalDate pitfall flagged
 * in CLAUDE.md — we want an absolute instant, not a wall-clock date.
 */
function utc(year: number, month1: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month1 - 1, day, hour, minute, 0));
}

const TZ = 'America/New_York';

describe('isInQuietHours', () => {
  describe('normal (non-wrapping) window 08:00-20:00', () => {
    const pref = { quietHoursEnabled: true, quietHoursStart: 8 * 60, quietHoursEnd: 20 * 60 };

    it('suppresses at 12:00 local', () => {
      // 12:00 ET = 17:00 UTC on a winter day
      const now = utc(2026, 2, 15, 17, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(true);
    });

    it('does not suppress at 22:00 local', () => {
      // 22:00 ET = 03:00 UTC next day on a winter day
      const now = utc(2026, 2, 16, 3, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(false);
    });
  });

  describe('wrap-around window 22:00-07:00', () => {
    const pref = { quietHoursEnabled: true, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60 };

    it('suppresses at 23:00 local', () => {
      // 23:00 ET winter = 04:00 UTC next day
      const now = utc(2026, 2, 16, 4, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(true);
    });

    it('suppresses at 06:00 local', () => {
      // 06:00 ET winter = 11:00 UTC
      const now = utc(2026, 2, 16, 11, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(true);
    });

    it('does not suppress at 12:00 local', () => {
      // 12:00 ET winter = 17:00 UTC
      const now = utc(2026, 2, 16, 17, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(false);
    });
  });

  describe('defensive cases', () => {
    it('never suppresses when quietHoursEnabled=false', () => {
      const pref = { quietHoursEnabled: false, quietHoursStart: 0, quietHoursEnd: 1439 };
      const now = utc(2026, 2, 16, 17, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(false);
    });

    it('does not suppress when enabled but bounds are null (misconfigured)', () => {
      const prefNullStart = { quietHoursEnabled: true, quietHoursStart: null, quietHoursEnd: 7 * 60 };
      const prefNullEnd = { quietHoursEnabled: true, quietHoursStart: 22 * 60, quietHoursEnd: null };
      const now = utc(2026, 2, 16, 4, 0); // 23:00 ET — would be inside 22-07
      expect(isInQuietHours(prefNullStart, TZ, now)).toBe(false);
      expect(isInQuietHours(prefNullEnd, TZ, now)).toBe(false);
    });
  });

  describe('timezone is respected', () => {
    it('window 22:00-07:00 in America/New_York does not suppress at UTC midnight (= 19:00 ET winter)', () => {
      const pref = { quietHoursEnabled: true, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60 };
      // 2026-02-16 00:00 UTC. EST (winter, UTC-5) → 2026-02-15 19:00 ET.
      // 19:00 < 22:00 and 19:00 >= 07:00, so outside the 22-07 wrap window.
      const now = utc(2026, 2, 16, 0, 0);
      expect(isInQuietHours(pref, TZ, now)).toBe(false);
    });
  });
});
