import { describe, it, expect } from 'vitest';
import {
  validateGoalLevel,
  getChildLevel,
  LEVEL_ORDER,
} from '@/lib/goal-validation';

describe('validateGoalLevel', () => {
  it('allows HIGH_HARD as root (null parent)', () => {
    expect(validateGoalLevel('HIGH_HARD', null)).toBe(true);
  });

  it('rejects HIGH_HARD with a parent', () => {
    expect(validateGoalLevel('HIGH_HARD', 'STRATEGIC')).toBe(false);
  });

  it('allows STRATEGIC under HIGH_HARD', () => {
    expect(validateGoalLevel('STRATEGIC', 'HIGH_HARD')).toBe(true);
  });

  it('rejects STRATEGIC under MONTHLY', () => {
    expect(validateGoalLevel('STRATEGIC', 'MONTHLY')).toBe(false);
  });

  it('allows MONTHLY under STRATEGIC', () => {
    expect(validateGoalLevel('MONTHLY', 'STRATEGIC')).toBe(true);
  });

  it('allows WEEKLY under MONTHLY', () => {
    expect(validateGoalLevel('WEEKLY', 'MONTHLY')).toBe(true);
  });

  it('allows DAILY under WEEKLY', () => {
    expect(validateGoalLevel('DAILY', 'WEEKLY')).toBe(true);
  });

  it('rejects DAILY as root', () => {
    expect(validateGoalLevel('DAILY', null)).toBe(false);
  });
});

describe('getChildLevel', () => {
  it('returns STRATEGIC for HIGH_HARD', () => {
    expect(getChildLevel('HIGH_HARD')).toBe('STRATEGIC');
  });

  it('returns MONTHLY for STRATEGIC', () => {
    expect(getChildLevel('STRATEGIC')).toBe('MONTHLY');
  });

  it('returns null for DAILY (no children)', () => {
    expect(getChildLevel('DAILY')).toBeNull();
  });
});

describe('LEVEL_ORDER', () => {
  it('has 5 levels in hierarchical order', () => {
    expect(LEVEL_ORDER).toEqual([
      'HIGH_HARD',
      'STRATEGIC',
      'MONTHLY',
      'WEEKLY',
      'DAILY',
    ]);
  });
});
