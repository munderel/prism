import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

/**
 * Subscribe to push notifications.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
  }

  // Upsert subscription
  const existing = await prisma.pushSubscription.findFirst({
    where: { userId: auth.userId, endpoint },
  });

  if (existing) {
    return Response.json(existing);
  }

  const sub = await prisma.pushSubscription.create({
    data: {
      userId: auth.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return Response.json(sub, { status: 201 });
}

/**
 * Unsubscribe from push notifications.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return Response.json({ error: 'endpoint is required' }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId: auth.userId, endpoint },
  });

  return Response.json({ ok: true });
}
