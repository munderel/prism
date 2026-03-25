import { describe, it, expect } from 'vitest';
import { computeIndividualReport, computeLeverageAnalysis } from '../lib/reports';

describe('computeIndividualReport', () => {
  it('computes completion and failure rates', () => {
    const tasks = [
      { status: 'DONE', taskType: 'IMPROVE', completedAt: new Date(), failedAt: null, recurrenceRule: null, title: 'A' },
      { status: 'DONE', taskType: 'IMPROVE', completedAt: new Date(), failedAt: null, recurrenceRule: null, title: 'B' },
      { status: 'DROPPED', taskType: 'REACT', completedAt: null, failedAt: new Date(), recurrenceRule: null, title: 'C' },
      { status: 'TODO', taskType: 'MAINTENANCE', completedAt: null, failedAt: null, recurrenceRule: 'FREQ=DAILY', title: 'D' },
    ];

    const report = computeIndividualReport(tasks, { currentCount: 5, bestCount: 10 });
    expect(report.completionRate).toBe(50);
    expect(report.failureRate).toBe(25);
    expect(report.totalTasks).toBe(4);
    expect(report.streakHistory).toEqual({ current: 5, best: 10 });
    expect(report.byType).toHaveLength(3);
  });

  it('handles empty tasks', () => {
    const report = computeIndividualReport([], null);
    expect(report.completionRate).toBe(0);
    expect(report.failureRate).toBe(0);
    expect(report.streakHistory).toEqual({ current: 0, best: 0 });
  });
});

describe('computeLeverageAnalysis', () => {
  it('sorts by frequency and suggests actions', () => {
    const tasks = Array.from({ length: 25 }, () => ({
      status: 'DONE', taskType: 'MAINTENANCE', completedAt: new Date(),
      failedAt: null, recurrenceRule: 'FREQ=DAILY', title: 'Daily standup',
    }));
    tasks.push(...Array.from({ length: 5 }, () => ({
      status: 'DONE', taskType: 'MAINTENANCE', completedAt: new Date(),
      failedAt: null, recurrenceRule: 'FREQ=WEEKLY', title: 'Weekly report',
    })));

    const analysis = computeLeverageAnalysis(tasks);
    expect(analysis[0].title).toBe('Daily standup');
    expect(analysis[0].suggestion).toBe('Automate');
    expect(analysis[1].suggestion).toBe('Keep');
  });
});
