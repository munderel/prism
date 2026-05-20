import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, pushSubscriptionSchema } from '@/lib/schemas';
import { cacheHeaders, NO_STORE } from '@/lib/api-helpers';

/** GET /api/notifications
 * Query params:
 *   unread=true  → only return unread notifications
 *   limit=N      → max rows (default 10, max 50)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const rawLimit = parseInt(searchParams.get('limit') ?? '10', 10);
  const limit = Math.min(50, Math.max(1, Number.isNaN(rawLimit) ? 10 : rawLimit));

  const where = {
    userId: auth.userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
  ]);

  return Response.json(
    { notifications, unreadCount },
    unreadOnly ? NO_STORE : { headers: cacheHeaders(5, 30) },
  );
}

/** PATCH /api/notifications — mark one or more notifications as read.
 * Body: { ids: string[] } or { all: true }
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (raw.all === true) {
    await prisma.notification.updateMany({
      where: { userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return Response.json({ ok: true }, NO_STORE);
  }

  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json(
      { error: 'ids must be a non-empty array, or pass all: true' },
      { status: 400 },
    );
  }
  const validIds = (ids as unknown[]).filter((id) => typeof id === 'string') as string[];
  await prisma.notification.updateMany({
    where: { id: { in: validIds }, userId: auth.userId },
    data: { readAt: new Date() },
  });
  return Response.json({ ok: true }, NO_STORE);
}

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
