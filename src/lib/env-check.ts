/**
 * Validate required environment variables at startup.
 * Call this early (e.g., from prisma.ts or instrumentation.ts) to fail fast.
 */

const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET'] as const;

const REQUIRED_IN_PRODUCTION = [
  'TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'CRON_SECRET',
] as const;

let validated = false;

export function validateEnv() {
  if (validated) return;
  if (process.env.NODE_ENV === 'test') return;
  validated = true;

  const missing: string[] = [];

  for (const key of REQUIRED) {
    if (!process.env[key]) missing.push(key);
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
