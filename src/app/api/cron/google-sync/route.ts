import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronSecret } from '@/lib/auth-guard';
import { runCalendarSync } from '@/lib/calendar-sync-engine';

// Background 2-way Google Calendar sync (Issue 8). Runs every ~15 min from
// GitHub Actions (.github/workflows/google-sync.yml). Pulls Google-side edits
// into Prism (and pushes anything an immediate push missed) so users never have
// to click "Sync". Each user's sync is serialized against a manual run by the
// engine's self-expiring claim lock; the syncToken gate keeps no-change users
// cheap.

// Vercel function budget. We stop dispatching new users a few seconds before
// this to return cleanly; unprocessed users are picked up next run (oldest
// first), so the rotation is fair across runs.
export const maxDuration = 60;
const WALL_CLOCK_BUDGET_MS = 50_000;
const MAX_USERS_PER_RUN = 200; // safety cap; oldest-first ordering rotates the rest
const SYNC_WINDOW_BACK_MS = 7 * 86_400_000;
const SYNC_WINDOW_FWD_MS = 30 * 86_400_000;

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const start = new Date(now.getTime() - SYNC_WINDOW_BACK_MS).toISOString();
  const end = new Date(now.getTime() + SYNC_WINDOW_FWD_MS).toISOString();

  // Sync-eligible = users who have linked Google Calendar. Oldest-first
  // (nulls first = never-synced) so every user gets a turn even if a run hits
  // the time budget before reaching everyone.
  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
    orderBy: [{ lastGoogleSyncAt: { sort: 'asc', nulls: 'first' } }],
    take: MAX_USERS_PER_RUN,
    select: { id: true },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let budgetHit = false;

  for (const user of users) {
    if (Date.now() - startedAt > WALL_CLOCK_BUDGET_MS) {
      budgetHit = true;
      break;
    }
    try {
      const result = await runCalendarSync(user.id, { start, end, viaCron: true });
      if (result.skipped) skipped++;
      else processed++;
    } catch (err) {
      failed++;
      console.error('[cron/google-sync] sync failed for user', user.id, err);
    } finally {
      // Advance the rotation cursor even on failure/skip so one stuck user
      // can't starve the rest.
      await prisma.user
        .update({ where: { id: user.id }, data: { lastGoogleSyncAt: new Date() } })
        .catch(() => {});
    }
  }

  return Response.json({
    ok: true,
    eligible: users.length,
    processed,
    skipped,
    failed,
    budgetHit,
    durationMs: Date.now() - startedAt,
  });
}
