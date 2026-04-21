/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { projectBuffer, computeBufferDerailInfo } from '@/lib/derailing-buffer';

function aim(partial: any) {
  return {
    id: 'ua-1',
    isActive: true,
    safetyBufferDays: 7,
    safetyBufferUpdatedAt: null as Date | null,
    derailedAt: null as Date | null,
    currentPhase: 'FLOW',
    customFrequency: null,
    aimCategory: { isDaily: true, defaultFrequency: 7, ...(partial.aimCategory ?? {}) },
    ...partial,
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('projectBuffer', () => {
  it('decays at 1/day for daily aims', () => {
    const ua = aim({ safetyBufferDays: 7, safetyBufferUpdatedAt: new Date('2026-04-20T00:00:00Z') });
    const now = new Date('2026-04-22T00:00:00Z');
    const { buffer, derailed } = projectBuffer(ua, now);
    expect(buffer).toBeCloseTo(5, 5);
    expect(derailed).toBe(false);
  });

  it('clamps elapsed time at zero for clock skew (now < safetyBufferUpdatedAt)', () => {
    const ua = aim({ safetyBufferDays: 2, safetyBufferUpdatedAt: new Date('2026-04-22T00:00:00Z') });
    const now = new Date('2026-04-21T00:00:00Z');
    const { buffer, derailed } = projectBuffer(ua, now);
    expect(buffer).toBe(2);
    expect(derailed).toBe(false);
  });

  it('returns the stored buffer unchanged when isActive is false', () => {
    const ua = aim({ isActive: false, safetyBufferDays: 3.5, safetyBufferUpdatedAt: new Date(Date.now() - 30 * DAY) });
    const { buffer, derailed } = projectBuffer(ua, new Date());
    expect(buffer).toBe(3.5);
    expect(derailed).toBe(false);
  });

  it('treats null safetyBufferUpdatedAt as "just updated" (no decay)', () => {
    const ua = aim({ safetyBufferDays: 7, safetyBufferUpdatedAt: null });
    const { buffer, derailed } = projectBuffer(ua, new Date());
    expect(buffer).toBe(7);
    expect(derailed).toBe(false);
  });

  it('marks derailed when buffer falls to or below zero', () => {
    const ua = aim({ safetyBufferDays: 0.5, safetyBufferUpdatedAt: new Date('2026-04-20T00:00:00Z') });
    const now = new Date('2026-04-22T00:00:00Z');
    const { buffer, derailed } = projectBuffer(ua, now);
    expect(buffer).toBe(0);
    expect(derailed).toBe(true);
  });

  it('decays at frequencyPerWeek / 7 for non-daily aims', () => {
    const ua = aim({
      aimCategory: { isDaily: false, defaultFrequency: 3 },
      safetyBufferDays: 7,
      safetyBufferUpdatedAt: new Date('2026-04-20T00:00:00Z'),
    });
    const now = new Date('2026-04-27T00:00:00Z'); // +7 days
    const { buffer } = projectBuffer(ua, now);
    // 3/week => 0.4286/day * 7 days = 3 days decay
    expect(buffer).toBeCloseTo(4, 1);
  });
});

describe('computeBufferDerailInfo', () => {
  it('emits on_track when buffer ≥ 1', () => {
    const ua = aim({ safetyBufferDays: 5, safetyBufferUpdatedAt: new Date() });
    const info = computeBufferDerailInfo(ua);
    expect(info.status).toBe('on_track');
  });

  it('emits caution when 0 < buffer < 1', () => {
    const ua = aim({
      safetyBufferDays: 1.0,
      safetyBufferUpdatedAt: new Date(Date.now() - 12 * HOUR),
    });
    const info = computeBufferDerailInfo(ua);
    expect(info.status).toBe('caution');
    expect(info.safetyBufferDays).toBeGreaterThan(0);
    expect(info.safetyBufferDays).toBeLessThan(1);
  });

  it('emits derailed with derailedAt set to now when buffer crosses zero', () => {
    const past = new Date('2026-04-10T00:00:00Z');
    const ua = aim({ safetyBufferDays: 1, safetyBufferUpdatedAt: past, derailedAt: null });
    const now = new Date('2026-04-20T00:00:00Z');
    const info = computeBufferDerailInfo(ua, now);
    expect(info.status).toBe('derailed');
    expect(info.derailedAt).toBe(now.toISOString());
    expect(info.safetyBufferDays).toBe(0);
  });

  it('emits derailed and preserves stored derailedAt when already derailed', () => {
    const prior = new Date('2026-04-15T12:00:00Z');
    const ua = aim({ safetyBufferDays: 0, safetyBufferUpdatedAt: prior, derailedAt: prior });
    const info = computeBufferDerailInfo(ua, new Date('2026-04-20T00:00:00Z'));
    expect(info.status).toBe('derailed');
    expect(info.derailedAt).toBe(prior.toISOString());
  });

  it('emits on_track with message "Aim is paused" when isActive is false', () => {
    const ua = aim({ isActive: false, safetyBufferDays: 2 });
    const info = computeBufferDerailInfo(ua);
    expect(info.status).toBe('on_track');
    expect(info.message).toMatch(/paused/i);
  });

  it('handles exactly buffer === 1 as on_track (not caution)', () => {
    const ua = aim({ safetyBufferDays: 1, safetyBufferUpdatedAt: new Date() });
    const info = computeBufferDerailInfo(ua, new Date());
    expect(info.status).toBe('on_track');
  });
});
