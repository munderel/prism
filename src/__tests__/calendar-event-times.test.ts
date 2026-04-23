import { describe, it, expect } from 'vitest';
import { buildEventTimes } from '@/lib/calendar';

describe('buildEventTimes', () => {
  it('returns ISO datetimes when both time blocks are set (timed event)', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2026-04-19T00:00:00Z'),
      timeBlockStart: new Date('2026-04-19T14:00:00Z'),
      timeBlockEnd: new Date('2026-04-19T15:00:00Z'),
    });
    expect(result.start).toBe('2026-04-19T14:00:00.000Z');
    expect(result.end).toBe('2026-04-19T15:00:00.000Z');
  });

  it('returns all-day { date } form when no time blocks are set', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2026-04-19T00:00:00Z'),
      timeBlockStart: null,
      timeBlockEnd: null,
    });
    expect(result.start).toEqual({ date: '2026-04-19' });
    expect(result.end).toEqual({ date: '2026-04-20' });
  });

  it('uses all-day form when only one side of the time block is set', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2026-04-19T00:00:00Z'),
      timeBlockStart: new Date('2026-04-19T14:00:00Z'),
      timeBlockEnd: null,
    });
    expect(result.start).toEqual({ date: '2026-04-19' });
    expect(result.end).toEqual({ date: '2026-04-20' });
  });

  it('accepts a YYYY-MM-DD string as scheduledDate without round-tripping through new Date', () => {
    const result = buildEventTimes({
      scheduledDate: '2026-04-19',
    });
    expect(result.start).toEqual({ date: '2026-04-19' });
    expect(result.end).toEqual({ date: '2026-04-20' });
  });

  it('all-day end is exclusive — single-day event on month boundary rolls to next month', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2026-01-31T00:00:00Z'),
    });
    expect(result.start).toEqual({ date: '2026-01-31' });
    expect(result.end).toEqual({ date: '2026-02-01' });
  });

  it('all-day end is exclusive — year boundary', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2026-12-31T00:00:00Z'),
    });
    expect(result.start).toEqual({ date: '2026-12-31' });
    expect(result.end).toEqual({ date: '2027-01-01' });
  });

  it('all-day end is exclusive — leap day', () => {
    const result = buildEventTimes({
      scheduledDate: new Date('2028-02-29T00:00:00Z'),
    });
    expect(result.start).toEqual({ date: '2028-02-29' });
    expect(result.end).toEqual({ date: '2028-03-01' });
  });
});
