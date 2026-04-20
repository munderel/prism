import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, reviewWorkBlocksSchema } from '@/lib/schemas';

// Writes the per-block review outcomes from the Power Down "Review Work Blocks" step
// and creates a single aggregated PowerdownWorkBlockReview row summarizing the day.
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, reviewWorkBlocksSchema);
  if ('error' in parsed) return parsed.error;
  const { powerdownSessionId, reviews } = parsed.data;

  const session = await prisma.powerdownSession.findFirst({
    where: { id: powerdownSessionId, userId: auth.userId },
    select: { id: true, sessionDate: true },
  });
  if (!session) return Response.json({ error: 'Powerdown session not found' }, { status: 404 });

  const ids = reviews.map((r) => r.workBlockId);
  const blocks = await prisma.workBlock.findMany({
    where: { id: { in: ids }, userId: auth.userId },
    select: { id: true, start: true, end: true, actualMinutes: true },
  });
  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  const now = new Date();

  await prisma.$transaction(
    reviews
      .filter((r) => blockMap.has(r.workBlockId))
      .map((r) => {
        const b = blockMap.get(r.workBlockId)!;
        const defaultMinutes = Math.max(
          0,
          Math.round((b.end.getTime() - b.start.getTime()) / 60000)
        );
        return prisma.workBlock.update({
          where: { id: r.workBlockId },
          data: {
            completionStatus: r.completionStatus,
            reviewedAt: now,
            notes: r.notes ?? undefined,
            actualMinutes:
              r.actualMinutes !== undefined && r.actualMinutes !== null
                ? r.actualMinutes
                : defaultMinutes,
          },
        });
      })
  );

  // Aggregate counts for the report row.
  let blocksCompleted = 0;
  let blocksPartial = 0;
  let blocksMissed = 0;
  let totalScheduled = 0;
  let totalCompleted = 0;

  for (const r of reviews) {
    const b = blockMap.get(r.workBlockId);
    if (!b) continue;
    const scheduled = Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60000));
    totalScheduled += scheduled;
    const actual = r.actualMinutes ?? scheduled;
    if (r.completionStatus === 'COMPLETED') {
      blocksCompleted += 1;
      totalCompleted += actual;
    } else if (r.completionStatus === 'PARTIAL') {
      blocksPartial += 1;
      totalCompleted += actual;
    } else {
      blocksMissed += 1;
    }
  }

  const review = await prisma.powerdownWorkBlockReview.create({
    data: {
      powerdownSessionId,
      userId: auth.userId,
      reviewDate: session.sessionDate,
      blocksTotal: reviews.length,
      blocksCompleted,
      blocksPartial,
      blocksMissed,
      totalScheduledMinutes: totalScheduled,
      totalCompletedMinutes: totalCompleted,
    },
  });

  return Response.json(review, { status: 201, ...NO_STORE });
}
