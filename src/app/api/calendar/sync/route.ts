import { NextRequest } from 'next/server';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, syncCalendarSchema } from '@/lib/schemas';
import { runCalendarSync } from '@/lib/calendar-sync-engine';

/**
 * Manual / UI Google Calendar sync. Thin wrapper around the shared
 * `runCalendarSync` engine (src/lib/calendar-sync-engine.ts) — validates the
 * session + body, then delegates. The background cron (/api/cron/google-sync)
 * calls the same engine directly, per user, so both paths share one
 * implementation.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, syncCalendarSchema);
  if ('error' in parsed) return parsed.error;
  const { start, end, force } = parsed.data;

  const result = await runCalendarSync(auth.userId, { start, end, force });
  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
