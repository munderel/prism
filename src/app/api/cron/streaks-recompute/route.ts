import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { recomputeUserStreaks, type UserRecomputeReport } from '@/lib/streak-recompute';

/**
 * Walks each user's PowerdownSession history and rewrites their `daily` and
 * `powerdown` Streak rows from the source of truth. Idempotent — safe to
 * re-run after the per-call point fixes are deployed. Lives under /api/cron
 * so it inherits the middleware JWT-bypass and the requireCronSecret auth
 * model used by the other cron endpoints; it is invoked on demand from
 * `scripts/recompute-streaks.ts`, not on a Vercel schedule.
 *
 * Body (JSON):
 *   - userId?: string   — recompute one user only. Omit to recompute all.
 *   - dryRun?: boolean  — return the diff without writing.
 *
 * Response:
 *   { ok: true, total, applied, dryRun, reports: UserRecomputeReport[] }
 */
export async function POST(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { userId?: string; dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — recompute all, write
  }

  const userIds = body.userId
    ? [body.userId]
    : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  const reports: UserRecomputeReport[] = [];
  let applied = 0;
  for (const userId of userIds) {
    try {
      const report = await recomputeUserStreaks(userId, { dryRun: body.dryRun });
      if (report.applied) applied++;
      reports.push(report);
    } catch (err) {
      console.error('[cron/streaks-recompute] failed for user=%s:', userId, err);
    }
  }

  return Response.json({
    ok: true,
    total: userIds.length,
    applied,
    dryRun: !!body.dryRun,
    reports,
  });
}
