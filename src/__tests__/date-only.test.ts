import { describe, it, expect } from 'vitest';
import { parseDateOnly, formatDateOnly, toDateOnlyInputValue } from '@/lib/date-utils';

describe('parseDateOnly', () => {
  it('parses a YYYY-MM-DD string to UTC midnight', () => {
    const d = parseDateOnly('2026-04-30');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  it('uses getUTC* methods to confirm UTC anchoring (timezone-independent)', () => {
    const d = parseDateOnly('2026-04-30')!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3);
    expect(d.getUTCDate()).toBe(30);
    expect(d.getUTCHours()).toBe(0);
  });

  it('returns null for null/undefined/empty', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseDateOnly('2026/04/30')).toBeNull();
    expect(parseDateOnly('not-a-date')).toBeNull();
    expect(parseDateOnly('2026-04-30T12:00:00')).toBeNull();
  });

  it('handles a DST transition date the same as any other', () => {
    const d = parseDateOnly('2026-03-08')!;
    expect(d.toISOString()).toBe('2026-03-08T00:00:00.000Z');
  });
});

describe('formatDateOnly', () => {
  it('formats a UTC-midnight Date as the same calendar date everywhere', () => {
    const d = new Date('2026-04-30T00:00:00.000Z');
    const result = formatDateOnly(d);
    expect(result).toContain('30');
    expect(result).toContain('2026');
    expect(result).toMatch(/Apr/i);
  });

  it('formats an ISO string the same as the equivalent Date', () => {
    const iso = '2026-04-30T00:00:00.000Z';
    const d = new Date(iso);
    expect(formatDateOnly(iso)).toBe(formatDateOnly(d));
  });

  it('uses UTC anchoring (matches explicit UTC formatter)', () => {
    // The bug we are preventing: a developer removes timeZone: 'UTC' from the
    // helper and Ottawa (UTC-4/-5) users see the previous day. Asserting
    // equality against an explicit UTC formatter locks the property in.
    const value = '2026-04-30T00:00:00.000Z';
    const expected = new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    expect(formatDateOnly(value)).toBe(expected);
  });

  it('forwards options but always overrides timeZone to UTC', () => {
    const value = '2026-04-30T00:00:00.000Z';
    const result = formatDateOnly(value, { weekday: 'long', timeZone: 'Asia/Tokyo' });
    const expected = new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'long',
      timeZone: 'UTC',
    });
    expect(result).toBe(expected);
  });

  it('returns em-dash placeholder for null/undefined/invalid', () => {
    expect(formatDateOnly(null)).toBe('—');
    expect(formatDateOnly(undefined)).toBe('—');
    expect(formatDateOnly('not-a-date')).toBe('—');
  });

  it('round-trips: parseDateOnly → formatDateOnly preserves the input date', () => {
    for (const s of ['2026-01-01', '2026-04-30', '2026-12-31', '2026-03-08']) {
      const formatted = formatDateOnly(parseDateOnly(s));
      const [, m, d] = s.split('-');
      expect(formatted).toContain(String(Number(d)));
      expect(formatted).toMatch(new RegExp(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1], 'i'));
    }
  });
});

describe('toDateOnlyInputValue', () => {
  // Pairs with parseDateOnly()/formatDateOnly(): date-only fields are stored as
  // UTC midnight, displayed UTC-anchored. This helper produces the YYYY-MM-DD
  // string for an <input type="date"> from a stored value without local-TZ shift.

  it('returns the UTC date for a UTC-midnight ISO string', () => {
    expect(toDateOnlyInputValue('2026-05-11T00:00:00.000Z')).toBe('2026-05-11');
  });

  it('returns the UTC date for a Date object (no local-TZ shift)', () => {
    const d = new Date('2026-05-11T00:00:00.000Z');
    expect(toDateOnlyInputValue(d)).toBe('2026-05-11');
  });

  it('passes through a bare YYYY-MM-DD string unchanged', () => {
    expect(toDateOnlyInputValue('2026-05-11')).toBe('2026-05-11');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(toDateOnlyInputValue(null)).toBe('');
    expect(toDateOnlyInputValue(undefined)).toBe('');
    expect(toDateOnlyInputValue('')).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(toDateOnlyInputValue('not-a-date')).toBe('');
  });
});
