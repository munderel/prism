import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, NO_STORE } from '@/lib/api-helpers';

/**
 * POST /api/aims/invitations/[id]/one-off
 * Body: {}
 *
 * Invitee attends the invited AIM as a one-off — no UserAim linkage, no
 * streak math (no UserAim to recompute against). Creates a COMPLETED
 * AimInstance for the invited category + date so the attendance is recorded.
 *
 * Ownership: the invitation's inviteeId must match the auth'd user.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const invitation = await prisma.aimInvitation.findUnique({
    where: { id },
    include: {
      aimInstance: {
        select: { aimCategoryId: true, scheduledDate: true },
      },
    },
  });
  if (!invitation) return notFoundResponse('AimInvitation');
  if (invitation.inviteeId !== auth.userId) return forbiddenResponse();

  const updated = await prisma.aimInvitation.update({
    where: { id },
    data: {
      status: 'ACCEPTED',
      isOneOff: true,
      linkedUserAimId: null,
      respondedAt: new Date(),
    },
  });

  // Create / mark-complete an AimInstance for the invited category. Idempotent
  // — if one already exists at this date, mark it COMPLETED.
  const existing = await prisma.aimInstance.findFirst({
    where: {
      userId: auth.userId,
      aimCategoryId: invitation.aimInstance.aimCategoryId,
      scheduledDate: invitation.aimInstance.scheduledDate,
    },
    select: { id: true, status: true },
  });

  let aimInstanceId: string;
  if (existing) {
    aimInstanceId = existing.id;
    if (existing.status !== 'COMPLETED') {
      await prisma.aimInstance.update({
        where: { id: existing.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
  } else {
    const created = await prisma.aimInstance.create({
      data: {
        userId: auth.userId,
        aimCategoryId: invitation.aimInstance.aimCategoryId,
        scheduledDate: invitation.aimInstance.scheduledDate,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      select: { id: true },
    });
    aimInstanceId = created.id;
  }

  return Response.json(
    { ok: true, invitation: updated, aimInstanceId },
    NO_STORE,
  );
}
