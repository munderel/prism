import { describe, it, expect } from 'vitest';
import { buildWorkBlockEventBody } from '@/lib/work-block-sync';

describe('buildWorkBlockEventBody', () => {
  it('uses mainObjective as the event summary', () => {
    const body = buildWorkBlockEventBody({
      taskTitle: 'Ship onboarding revamp',
      mainObjective: 'Polish the empty state',
    });
    expect(body.summary).toBe('Polish the empty state');
  });

  it('puts the task title + objective in the description', () => {
    const body = buildWorkBlockEventBody({
      taskTitle: 'Ship onboarding revamp',
      mainObjective: 'Polish the empty state',
    });
    expect(body.description).toBe('Ship onboarding revamp\nPolish the empty state');
  });

  it('falls back to "Work block" when the task title is missing', () => {
    // Older blocks pre-date the sync schema; their backfilled task lookup can
    // be null. The helper must still produce a usable description (regression
    // test for the PATCH-create-fallback bug fixed in PR #29 follow-up).
    expect(buildWorkBlockEventBody({ taskTitle: null, mainObjective: 'Write spec' }).description)
      .toBe('Work block\nWrite spec');
    expect(buildWorkBlockEventBody({ taskTitle: undefined, mainObjective: 'Write spec' }).description)
      .toBe('Work block\nWrite spec');
  });

  it('description always contains the task title (regression: PATCH fallback)', () => {
    // Before the fix, the PATCH self-heal branch passed only `mainObjective`
    // for `description`, losing the task title. This asserts the shared
    // helper now used by both POST and PATCH-create-fallback can't regress
    // back to that shape.
    const body = buildWorkBlockEventBody({
      taskTitle: 'Hire designer',
      mainObjective: 'Draft job spec',
    });
    expect(body.description).toContain('Hire designer');
    expect(body.description).toContain('Draft job spec');
  });
});
