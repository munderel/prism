import { createApiClient } from '../fixtures/api-client';
import { sweepByPrefix } from './cleanup';

async function main() {
  // eslint-disable-next-line no-console
  console.log('[nuke] sweeping all [E2E*]-prefixed entities for the authenticated test user...');
  const api = await createApiClient();
  const { deleted, checked } = await sweepByPrefix(api);
  // eslint-disable-next-line no-console
  console.log(`[nuke] checked ${checked} entities, deleted ${deleted} matches`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
