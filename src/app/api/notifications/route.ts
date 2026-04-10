import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, pushSubscriptionSchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, pushSubscriptionSchema);
  if ('error' in parsed) return parsed.error;
  const { endpoint, keys } = parsed.data;

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
