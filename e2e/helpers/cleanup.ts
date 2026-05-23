import type { ApiClient } from '../fixtures/api-client';
import { E2E_PREFIX_REGEX } from '../fixtures/test-data';

export type EntityType =
  | 'task'
  | 'goal'
  | 'stack'
  | 'idea'
  | 'process'
  | 'work-block'
  | 'meeting'
  | 'food-block'
  | 'aim-category'
  | 'team-review'
  | 'review';

export interface TrackedEntity {
  type: EntityType;
  id: string;
  title?: string | null;
}

const DELETE_URL: Record<EntityType, (id: string) => string> = {
  task: (id) => `/api/tasks/${id}`,
  goal: (id) => `/api/goals/${id}`,
  stack: (id) => `/api/stacks/${id}`,
  idea: (id) => `/api/ideas/${id}`,
  process: (id) => `/api/processes/${id}`,
  'work-block': (id) => `/api/work-blocks/${id}`,
  meeting: (id) => `/api/meetings/${id}`,
  'food-block': (id) => `/api/food-blocks/${id}`,
  'aim-category': (id) => `/api/aims/categories/${id}`,
  'team-review': (id) => `/api/team-reviews/${id}`,
  review: (id) => `/api/reviews/${id}`,
};

function safeToDelete(title: string | null | undefined): boolean {
  // Hard guard: refuse to delete anything not marked with our E2E prefix. Protects against
  // bugs in tests accidentally tracking a pre-existing entity from the test account.
  if (!title) return false;
  return E2E_PREFIX_REGEX.test(title);
}

export async function sweepEntities(api: ApiClient, entities: TrackedEntity[]): Promise<void> {
  // Delete in reverse creation order so children go before parents.
  for (const e of [...entities].reverse()) {
    if (!safeToDelete(e.title)) {
      // eslint-disable-next-line no-console
      console.warn(`[cleanup] refusing to delete ${e.type}:${e.id} — title "${e.title}" lacks E2E prefix`);
      continue;
    }
    const url = DELETE_URL[e.type](e.id);
    try {
      const status = await api.del(url);
      if (status >= 400 && status !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`[cleanup] DELETE ${url} -> ${status}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[cleanup] DELETE ${url} threw`, err);
    }
  }
}

// Best-effort list+filter+delete sweep, used by nuke script. Only deletes entities whose
// title matches the [E2E*] prefix regex.
export async function sweepByPrefix(api: ApiClient): Promise<{ deleted: number; checked: number }> {
  let deleted = 0;
  let checked = 0;

  const listEndpoints: Array<{ url: string; type: EntityType; titleKey: string }> = [
    { url: '/api/tasks', type: 'task', titleKey: 'title' },
    { url: '/api/goals', type: 'goal', titleKey: 'title' },
    { url: '/api/stacks', type: 'stack', titleKey: 'name' },
    { url: '/api/ideas', type: 'idea', titleKey: 'title' },
    { url: '/api/processes', type: 'process', titleKey: 'name' },
    { url: '/api/work-blocks', type: 'work-block', titleKey: 'name' },
    { url: '/api/food-blocks', type: 'food-block', titleKey: 'name' },
    { url: '/api/aims/categories', type: 'aim-category', titleKey: 'name' },
    { url: '/api/team-reviews', type: 'team-review', titleKey: 'name' },
  ];

  for (const ep of listEndpoints) {
    try {
      const items = await api.get<Array<Record<string, unknown>>>(ep.url);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        checked += 1;
        const title = (item as Record<string, unknown>)[ep.titleKey] as string | undefined;
        const id = (item as Record<string, unknown>).id as string | undefined;
        if (!id || !safeToDelete(title)) continue;
        const status = await api.del(DELETE_URL[ep.type](id));
        if (status < 400) deleted += 1;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[sweepByPrefix] listing ${ep.url} failed`, err);
    }
  }

  return { deleted, checked };
}
