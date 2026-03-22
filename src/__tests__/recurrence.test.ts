import { describe, it, expect } from 'vitest';
import { parseRRule, getNextOccurrence } from '../lib/recurrence';

describe('parseRRule', () => {
  it('parses FREQ=DAILY with default interval', () => {
    expect(parseRRule('FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 1 });
  });

  it('parses FREQ=WEEKLY;INTERVAL=2', () => {
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2')).toEqual({ freq: 'WEEKLY', interval: 2 });
  });

  it('parses FREQ=MONTHLY;INTERVAL=3', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=3')).toEqual({ freq: 'MONTHLY', interval: 3 });
  });

  it('throws on invalid rule (no FREQ)', () => {
    expect(() => parseRRule('INTERVAL=2')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseRRule('')).toThrow();
  });

  it('throws on unsupported frequency', () => {
    expect(() => parseRRule('FREQ=YEARLY')).toThrow();
  });
});

describe('getNextOccurrence', () => {
  it('adds 1 day for DAILY', () => {
    const date = new Date('2026-03-21');
    const result = getNextOccurrence(date, { freq: 'DAILY', interval: 1 });
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-22');
  });

  it('adds 2 weeks for WEEKLY interval=2', () => {
    const date = new Date('2026-03-21');
    const result = getNextOccurrence(date, { freq: 'WEEKLY', interval: 2 });
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-04');
  });

  it('adds 1 month for MONTHLY', () => {
    const date = new Date('2026-03-15');
    const result = getNextOccurrence(date, { freq: 'MONTHLY', interval: 1 });
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('clamps end-of-month for MONTHLY (Jan 31 → Feb 28)', () => {
    const date = new Date(2026, 0, 31); // Jan 31 local time
    const result = getNextOccurrence(date, { freq: 'MONTHLY', interval: 1 });
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it('adds 3 days for DAILY interval=3', () => {
    const date = new Date('2026-03-21');
    const result = getNextOccurrence(date, { freq: 'DAILY', interval: 3 });
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-24');
  });
});
