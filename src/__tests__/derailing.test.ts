import { describe, it, expect } from 'vitest';
import { checkTaskDerailStatus, checkStreakAtRisk } from '../lib/derailing';

const tz = 'America/New_York';

describe('checkTaskDerailStatus', () => {
  it('returns ok for DONE tasks', () => {
    expect(checkTaskDerailStatus({ status: 'DONE', dueDate: new Date() }, tz)).toBe('ok');
  });

  it('returns ok for DROPPED tasks', () => {
    expect(checkTaskDerailStatus({ status: 'DROPPED', dueDate: new Date() }, tz)).toBe('ok');
  });

  it('returns ok for tasks with no due date', () => {
    expect(checkTaskDerailStatus({ status: 'TODO', dueDate: null }, tz)).toBe('ok');
  });

  it('returns ok for tasks due on a different day', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(checkTaskDerailStatus({ status: 'TODO', dueDate: tomorrow }, tz)).toBe('ok');
  });
});

describe('checkStreakAtRisk', () => {
  it('returns false when there are completions today', () => {
    expect(checkStreakAtRisk(3, tz)).toBe(false);
  });
});
