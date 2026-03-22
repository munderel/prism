import { describe, it, expect } from 'vitest';
import {
  computeLeafProgress,
  computeParentProgress,
  computeLinkedProgress,
} from '@/lib/progress';

describe('computeLeafProgress', () => {
  it('returns 0 when no tasks', () => {
    expect(computeLeafProgress([])).toBe(0);
  });

  it('returns 100 when all tasks done', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'DONE' },
    ];
    expect(computeLeafProgress(tasks as any)).toBe(100);
  });

  it('returns correct percentage for partial completion', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'TODO' },
      { status: 'IN_PROGRESS' },
      { status: 'DONE' },
      { status: 'TODO' },
    ];
    expect(computeLeafProgress(tasks as any)).toBe(40);
  });

  it('counts DROPPED tasks as completed for percentage', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'DROPPED' },
      { status: 'TODO' },
    ];
    // DROPPED are excluded from total: 1 done / 2 active = 50%
    expect(computeLeafProgress(tasks as any)).toBe(50);
  });
});

describe('computeParentProgress', () => {
  it('returns 0 when no children', () => {
    expect(computeParentProgress([])).toBe(0);
  });

  it('returns average of children progressPct', () => {
    const children = [
      { progressPct: 40 },
      { progressPct: 80 },
    ];
    expect(computeParentProgress(children as any)).toBe(60);
  });

  it('includes zero-progress children in average', () => {
    const children = [
      { progressPct: 100 },
      { progressPct: 0 },
    ];
    expect(computeParentProgress(children as any)).toBe(50);
  });
});

describe('computeLinkedProgress', () => {
  it('returns 0 when no links', () => {
    expect(computeLinkedProgress([])).toBe(0);
  });

  it('returns weighted average of linked goals', () => {
    const links = [
      { weight: 1.0, individualGoal: { progressPct: 30 } },
      { weight: 2.0, individualGoal: { progressPct: 90 } },
    ];
    // (30*1 + 90*2) / (1+2) = 210/3 = 70
    expect(computeLinkedProgress(links as any)).toBe(70);
  });

  it('handles equal weights', () => {
    const links = [
      { weight: 1.0, individualGoal: { progressPct: 50 } },
      { weight: 1.0, individualGoal: { progressPct: 100 } },
    ];
    expect(computeLinkedProgress(links as any)).toBe(75);
  });
});
