import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, NO_STORE } from '@/lib/api-helpers';
import { recomputeAimStreaks } from '@/lib/streak-recompute';

/**
 * POST /api/aims/invitations/[id]/link
 * Body: { userAimId: string }
 *
 * Invitee accepts an AIM invitation and attributes it to one of their existing
 * UserAims. Side effects:
 *   - Sets AimInvitation.status = ACCEPTED, linkedUserAimId = userAimId,
 *     respondedAt = now.
 *   - Creates a COMPLETED AimInstance for the invitee at the invited
 *     category + scheduledDate (so the streak engine sees attendance).
 *   - Fires recomputeAimStreaks(userId) — the linked UserAim's streak now
 *     reflects the new completed instance.
 *
 * Ownership: the invitation's inviteeId must match the auth'd user, AND the
 * provided UserAim must belong to the auth'd user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const userAimId = raw.userAimId;
  if (typeof userAimId !== 'string' || !userAimId) {
    return Response.json({ error: 'userAimId is required' }, { status: 400 });
  }

  // Load + ownership-check the invitation (must include the underlying instance
  // for date / category info).
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

  // Ownership-check the UserAim
  const userAim = await prisma.userAim.findUnique({
    where: { id: userAimId },
    select: { id: true, userId: true, aimCategoryId: true },
  });
  if (!userAim) return notFoundResponse('UserAim');
  if (userAim.userId !== auth.userId) return forbiddenResponse();

  // Update invitation: ACCEPTED + link
  const updated = await prisma.aimInvitation.update({
    where: { id },
    data: {
      status: 'ACCEPTED',
      linkedUserAimId: userAimId,
      isOneOff: false,
      respondedAt: new Date(),
    },
  });

  // Create a COMPLETED AimInstance for the invitee so streak math sees it.
  // Use the linked UserAim's category (which may differ from the invited
  // category — that's the point: "link to similar" attributes attendance to
  // the user's chosen aim).
  // Find-first-then-create for idempotency: if the invitee already has an
  // instance for this UserAim's category at this date, just mark it complete.
  const existing = await prisma.aimInstance.findFirst({
    where: {
      userId: auth.userId,
      aimCategoryId: userAim.aimCategoryId,
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
        aimCategoryId: userAim.aimCategoryId,
        scheduledDate: invitation.aimInstance.scheduledDate,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      select: { id: true },
    });
    aimInstanceId = created.id;
  }

  // Fire-and-forget streak recompute — the new COMPLETED instance should be
  // visible to the engine on next read.
  recomputeAimStreaks(auth.userId).catch((err) =>
    console.warn('[invitations/link] recomputeAimStreaks failed:', err),
  );

  return Response.json(
    { ok: true, invitation: updated, aimInstanceId },
    NO_STORE,
  );
}
