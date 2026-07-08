// Centralized server-side error reporting. Builds on the existing structured
// logger (src/lib/logger.ts) rather than pulling in Sentry — no new dependency.
// Every unhandled API error and cron failure funnels through reportError so
// there is one place to (a) emit a redacted, structured error line and
// (b) optionally fan out to an incident webhook.
//
// If ALERT_WEBHOOK_URL is set, a compact JSON payload is POSTed with a 5s
// timeout. The POST is AWAITED (not fire-and-forget) so it survives on
// serverless where background work is killed after the response is sent — but
// any webhook failure is swallowed so alerting can never turn a handled error
// into a crashed request.

import { createLogger } from './logger';

const WEBHOOK_TIMEOUT_MS = 5000;

export async function reportError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // The logger redacts secret-bearing keys in meta before it leaves the process.
  createLogger(context).error(message, { ...meta, stack });

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context,
        message,
        stack,
        meta,
        time: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch {
    // Alerting is best-effort: a dead/slow webhook host must never propagate
    // into the request path. The structured log above is the durable record.
  }
}
