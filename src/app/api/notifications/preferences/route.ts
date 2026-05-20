import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { cacheHeaders, NO_STORE } from '@/lib/api-helpers';
import { NotificationType, NotificationChannel } from '@prisma/client';

/** All notification types and channels, used to create defaults. */
const ALL_TYPES = Object.values(NotificationType);
const ALL_CHANNELS = Object.values(NotificationChannel);

/**
 * Ensure every (notifType × channel) row exists for this user.
 * Creates missing rows with enabled=true. Idempotent.
 */
async function ensureDefaults(userId: string) {
  const existing = await prisma.notificationChannelPref.findMany({
    where: { userId },
  });

  const existingSet = new Set(
    existing.map((r) => `${r.notifType}:${r.channel}`)
  );

  const missing = [];
  for (const notifType of ALL_TYPES) {
    for (const channel of ALL_CHANNELS) {
      if (!existingSet.has(`${notifType}:${channel}`)) {
        missing.push({ userId, notifType, channel, enabled: true });
      }
    }
  }

  if (missing.length > 0) {
    await prisma.notificationChannelPref.createMany({
      data: missing,
      skipDuplicates: true,
    });
  }
}

/**
 * GET /api/notifications/preferences
 * Returns all NotificationChannelPref rows for the authenticated user.
 * Creates defaults on first call.
 */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  await ensureDefaults(auth.userId);

  const prefs = await prisma.notificationChannelPref.findMany({
    where: { userId: auth.userId },
    orderBy: [{ notifType: 'asc' }, { channel: 'asc' }],
  });

  return Response.json(prefs, { headers: cacheHeaders(5, 30) });
}

const patchSchema = z.object({
  notifType: z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel),
  enabled: z.boolean(),
});

/**
 * PATCH /api/notifications/preferences
 * Upsert a single (notifType × channel) preference.
 * Body: { notifType: NotificationType, channel: NotificationChannel, enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, patchSchema);
  if ('error' in parsed) return parsed.error;

  const { notifType, channel, enabled } = parsed.data;

  const pref = await prisma.notificationChannelPref.upsert({
    where: {
      userId_notifType_channel: {
        userId: auth.userId,
        notifType,
        channel,
      },
    },
    update: { enabled },
    create: { userId: auth.userId, notifType, channel, enabled },
  });

  return Response.json(pref, NO_STORE);
}
