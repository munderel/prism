import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, NO_STORE } from '@/lib/api-helpers';

type AttendStatus = 'GOING' | 'MAYBE' | 'NOT_GOING';

/**
 * POST /api/aims/instances/[id]/attend
 * Body: { status: 'GOING' | 'MAYBE' | 'NOT_GOING' }
 *
 * - GOING: create the user's own AimInstance for the same category+date (counts
 *   toward their streak independently). Idempotent if one already exists.
 *   Returns { ok: true, ownInstanceId }.
 *
 * - NOT_GOING: upsert an AimInstanceDismissal row with status='NOT_GOING' so the
 *   ephemeral tile is hidden in future groupable-aims queries.
 *   Returns { ok: true }.
 *
 * - MAYBE: upsert an AimInstanceDismissal row with status='MAYBE'. The tile stays
 *   visible (groupable-aims only hides NOT_GOING) but the attendStatus badge
 *   updates to 'MAYBE'. Does NOT create an own instance.
 *   Returns { ok: true }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Load the source AIM instance (the teammate's)
  const sourceInstance = await prisma.aimInstance.findUnique({
    where: { id },
    select: {
      id: true,
      aimCategoryId: true,
      scheduledDate: true,
      timeBlockStart: true,
      timeBlockEnd: true,
      userId: true,
    },
  });
  if (!sourceInstance) return notFoundResponse('AimInstance');

  // The attend flow is only meaningful for *teammate* instances. Posting attend
  // against one's own AimInstance would either duplicate it (GOING) or pollute
  // the dismissal table with self-references (NOT_GOING / MAYBE). Reject 400.
  if (sourceInstance.userId === auth.userId) {
    return Response.json(
      { error: 'Cannot attend your own AIM instance' },
      { status: 400 },
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const status = raw.status as string | undefined;

  const validStatuses: AttendStatus[] = ['GOING', 'MAYBE', 'NOT_GOING'];
  if (!status || !validStatuses.includes(status as AttendStatus)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    );
  }

  const attendStatus = status as AttendStatus;

  if (attendStatus === 'GOING') {
    // Upsert user's own AimInstance for same category+date.
    // Use a find-first then create pattern for idempotency without relying on
    // a unique constraint (AimInstance has no @@unique on userId+aimCategoryId+scheduledDate).
    const existing = await prisma.aimInstance.findFirst({
      where: {
        userId: auth.userId,
        aimCategoryId: sourceInstance.aimCategoryId,
        scheduledDate: sourceInstance.scheduledDate,
      },
      select: { id: true },
    });

    // Mark the joined instance as a group activity (isGroupOpen) so it renders
    // with the group indicator. The teammate's ephemeral overlay tile is then
    // suppressed client-side once attendStatus is GOING, leaving exactly one
    // calendar entry that's clearly flagged as a group task.
    let ownInstanceId: string;
    if (existing) {
      await prisma.aimInstance.update({
        where: { id: existing.id },
        data: { isGroupOpen: true },
      });
      ownInstanceId = existing.id;
    } else {
      const newInstance = await prisma.aimInstance.create({
        data: {
          userId: auth.userId,
          aimCategoryId: sourceInstance.aimCategoryId,
          scheduledDate: sourceInstance.scheduledDate,
          timeBlockStart: sourceInstance.timeBlockStart,
          timeBlockEnd: sourceInstance.timeBlockEnd,
          status: 'SCHEDULED',
          isGroupOpen: true,
        },
        select: { id: true },
      });
      ownInstanceId = newInstance.id;
    }

    // Clean up any prior dismissal since user is now GOING
    await prisma.aimInstanceDismissal.deleteMany({
      where: { aimInstanceId: id, userId: auth.userId },
    });

    return Response.json({ ok: true, ownInstanceId }, NO_STORE);
  }

  // MAYBE or NOT_GOING: upsert dismissal row
  await prisma.aimInstanceDismissal.upsert({
    where: {
      aimInstanceId_userId: {
        aimInstanceId: id,
        userId: auth.userId,
      },
    },
    create: {
      aimInstanceId: id,
      userId: auth.userId,
      status: attendStatus,
    },
    update: {
      status: attendStatus,
    },
  });

  return Response.json({ ok: true }, NO_STORE);
}
