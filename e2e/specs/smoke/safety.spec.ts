import { test, expect } from '../../fixtures/test';
import { E2E_RUN_ID, E2E_PREFIX_REGEX } from '../../fixtures/test-data';

// Runs first (alphabetical). If this fails, the rest of the suite is unsafe to run.
test.describe('@smoke safety pretest', () => {
  test('storageState authenticates to the test user', async ({ api }) => {
    // Hit any cheap authed endpoint. Health is unauthed; use stacks (list) which requires auth.
    const stacks = await api.get<unknown>('/api/stacks');
    expect(stacks).toBeDefined();
  });

  test('runId does not collide with existing prefixed data', async ({ api }) => {
    // If the user already has data starting with our runId prefix (Date.now in base36),
    // bail out — collision means cleanup might miss leaks.
    const tasks = await api.get<Array<{ title?: string }>>('/api/tasks').catch(() => []);
    const collisions = (tasks ?? []).filter((t) => t.title?.startsWith(`[E2E ${E2E_RUN_ID}] `));
    expect(collisions.length, `runId ${E2E_RUN_ID} collides with existing entities`).toBe(0);
  });

  test('E2E prefix regex matches our prefix', () => {
    expect(`[E2E ${E2E_RUN_ID}] x`).toMatch(E2E_PREFIX_REGEX);
    expect('regular task title').not.toMatch(E2E_PREFIX_REGEX);
  });
});
