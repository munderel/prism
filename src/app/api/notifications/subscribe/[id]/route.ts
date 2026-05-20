import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, NO_STORE } from '@/lib/api-helpers';

/**
 * DELETE /api/notifications/subscribe/[id]
 * Remove a push subscription. Only the owner may delete their own subscription.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const sub = await prisma.pushSubscription.findUnique({ where: { id } });
  if (!sub) return notFoundResponse('PushSubscription');
  if (sub.userId !== auth.userId && !auth.session.user.isAdmin) return forbiddenResponse();

  await prisma.pushSubscription.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}

/**
 * PATCH /api/notifications/subscribe/[id]
 * Update label for a subscription.
 * Body: { label: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const sub = await prisma.pushSubscription.findUnique({ where: { id } });
  if (!sub) return notFoundResponse('PushSubscription');
  if (sub.userId !== auth.userId && !auth.session.user.isAdmin) return forbiddenResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label.slice(0, 100) : undefined;
  if (label === undefined) {
    return Response.json({ error: 'label is required' }, { status: 400 });
  }

  const updated = await prisma.pushSubscription.update({
    where: { id },
    data: { label },
  });

  return Response.json(updated, NO_STORE);
}
