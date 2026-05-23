// Unique run id used as a prefix on every created entity title, so cleanup can find them
// and so leaked rows are searchable in the DB.
const runId = Date.now().toString(36);

export const E2E_RUN_ID = runId;
export const E2E_PREFIX = `[E2E ${runId}] `;
export const E2E_PREFIX_REGEX = /^\[E2E [a-z0-9]+\] /;

let counter = 0;
export function uniqueTitle(label: string): string {
  counter += 1;
  return `${E2E_PREFIX}${label} #${counter}`;
}

export function isE2EOwned(title: string | null | undefined): boolean {
  return typeof title === 'string' && E2E_PREFIX_REGEX.test(title);
}
