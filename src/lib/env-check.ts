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

// Optional vars — not required to boot, but if set they must be well-formed so
// a typo is caught at startup instead of silently disabling the feature.
// ALERT_WEBHOOK_URL powers the incident fan-out in src/lib/error-reporter.ts;
// unset means "log only".
const OPTIONAL_URL_VARS = ['ALERT_WEBHOOK_URL'] as const;

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

  for (const key of OPTIONAL_URL_VARS) {
    const value = process.env[key];
    if (!value) continue;
    try {
      new URL(value);
    } catch {
      throw new Error(`[env] ${key} is set but is not a valid URL`);
    }
  }
}
