import { test as base, expect } from '@playwright/test';
import { ApiClient, createApiClient } from './api-client';
import { sweepEntities, TrackedEntity } from '../helpers/cleanup';

type Fixtures = {
  api: ApiClient;
  track: (entity: TrackedEntity) => void;
};

export const test = base.extend<Fixtures>({
  api: async ({ context }, use) => {
    const api = await createApiClient(context);
    await use(api);
  },

  // Per-test entity tracker. Push every created entity (with type+id+title) so afterEach can delete.
  track: async ({ api }, use) => {
    const created: TrackedEntity[] = [];
    await use((e) => {
      created.push(e);
    });
    if (created.length) {
      await sweepEntities(api, created);
    }
  },
});

export { expect };
