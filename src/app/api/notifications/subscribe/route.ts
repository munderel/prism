import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { cacheHeaders, NO_STORE } from '@/lib/api-helpers';

/**
 * GET /api/notifications/subscribe
 * Returns all push subscriptions for the authenticated user (for the devices list).
 */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: auth.userId },
    select: {
      id: true,
      label: true,
      deviceType: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  });

  return Response.json(subs, { headers: cacheHeaders(5, 30) });
}

const subscribeSchema = z.object({
  endpoint: z.string().min(1, 'endpoint is required'),
  keys: z.object({
    p256dh: z.string().min(1, 'keys.p256dh is required'),
    auth: z.string().min(1, 'keys.auth is required'),
  }),
  deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  label: z.string().max(100).optional(),
  userAgent: z.string().max(1000).optional(),
});

/**
 * POST /api/notifications/subscribe
 * Upsert a push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth }, deviceType?, label?, userAgent? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, subscribeSchema);
  if ('error' in parsed) return parsed.error;

  const { endpoint, keys, deviceType, label, userAgent } = parsed.data;

  // Upsert by endpoint — if the same endpoint re-subscribes, refresh lastSeenAt and metadata
  const existing = await prisma.pushSubscription.findFirst({
    where: { userId: auth.userId, endpoint },
  });

  let sub;
  if (existing) {
    sub = await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        lastSeenAt: new Date(),
        ...(deviceType !== undefined && { deviceType }),
        ...(label !== undefined && { label }),
        ...(userAgent !== undefined && { userAgent }),
      },
    });
    return Response.json(sub, NO_STORE);
  }

  sub = await prisma.pushSubscription.create({
    data: {
      userId: auth.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      deviceType: deviceType ?? null,
      label: label ?? null,
      userAgent: userAgent ?? null,
      lastSeenAt: new Date(),
    },
  });

  return Response.json(sub, { status: 201, ...NO_STORE });
}
