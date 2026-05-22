import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { cacheHeaders, NO_STORE, pickDefined } from '@/lib/api-helpers';
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

/**
 * Body for PATCH. `enabled` and the quiet-hours fields are all optional so
 * the same endpoint can flip a channel on/off or update its quiet-hours
 * window independently.
 *
 * `channel` may be `null` to mean "apply quiet hours to every (notifType,
 * channel) row for this user, scoped to the given notifType". When null,
 * `enabled` MUST be omitted — only quiet-hours fields are allowed in that
 * mode. This keeps the per-channel UI simple: one PATCH updates the window
 * across all notifTypes for a channel without forcing the client to issue
 * 7+ PATCH calls (one per notifType).
 */
const quietHoursMinute = z
  .number()
  .int()
  .min(0)
  .max(1439)
  .nullable();

const patchSchema = z.object({
  notifType: z.nativeEnum(NotificationType).optional(),
  channel: z.nativeEnum(NotificationChannel).nullable(),
  enabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: quietHoursMinute.optional(),
  quietHoursEnd: quietHoursMinute.optional(),
});

/**
 * PATCH /api/notifications/preferences
 *
 * Two modes:
 * 1. Per-row update — body includes `notifType` + `channel` (non-null).
 *    Upserts that single row.
 * 2. Bulk-channel quiet-hours — body includes `channel` (non-null) and omits
 *    `notifType`. Applies the quiet-hours fields to every existing row for
 *    (userId, channel). Used by the UI's per-channel quiet-hours picker so
 *    a single window setting applies across all notifTypes for that channel.
 *
 * `enabled` may only appear in mode 1.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, patchSchema);
  if ('error' in parsed) return parsed.error;

  const body = parsed.data;
  const { notifType, channel, enabled } = body;

  if (channel === null) {
    return Response.json({ error: 'channel is required' }, { status: 400 });
  }

  // Validate quietHoursEnabled coherence: if turning on, the window bounds
  // must be present (either in this PATCH or already on the row).
  const hasQuietHoursFields =
    body.quietHoursEnabled !== undefined ||
    body.quietHoursStart !== undefined ||
    body.quietHoursEnd !== undefined;

  if (body.quietHoursEnabled === true) {
    if (body.quietHoursStart === null || body.quietHoursEnd === null) {
      return Response.json(
        { error: 'quietHoursEnabled=true requires non-null quietHoursStart and quietHoursEnd' },
        { status: 400 },
      );
    }
  }

  // --- Mode 2: bulk quiet-hours update across all notifTypes for a channel
  if (notifType === undefined) {
    if (enabled !== undefined) {
      return Response.json(
        { error: 'enabled cannot be combined with bulk quiet-hours update (omit `notifType`)' },
        { status: 400 },
      );
    }
    if (!hasQuietHoursFields) {
      return Response.json(
        { error: 'No fields to update' },
        { status: 400 },
      );
    }

    const patch = pickDefined(body as Record<string, unknown>, [
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
    ]);

    // If turning on but caller didn't supply start/end, verify all existing
    // rows for this channel already have non-null start/end.
    if (body.quietHoursEnabled === true) {
      const existing = await prisma.notificationChannelPref.findMany({
        where: { userId: auth.userId, channel },
        select: { quietHoursStart: true, quietHoursEnd: true },
      });
      const supplyingStart = body.quietHoursStart !== undefined;
      const supplyingEnd = body.quietHoursEnd !== undefined;
      const allHaveBounds = existing.every(
        (r) => (supplyingStart || r.quietHoursStart !== null) && (supplyingEnd || r.quietHoursEnd !== null),
      );
      if (!allHaveBounds) {
        return Response.json(
          { error: 'quietHoursEnabled=true requires non-null quietHoursStart and quietHoursEnd' },
          { status: 400 },
        );
      }
    }

    const { count } = await prisma.notificationChannelPref.updateMany({
      where: { userId: auth.userId, channel },
      data: patch,
    });

    return Response.json({ updated: count }, NO_STORE);
  }

  // --- Mode 1: per-row upsert
  const updateData = pickDefined(body as Record<string, unknown>, [
    'enabled',
    'quietHoursEnabled',
    'quietHoursStart',
    'quietHoursEnd',
  ]);

  const pref = await prisma.notificationChannelPref.upsert({
    where: {
      userId_notifType_channel: {
        userId: auth.userId,
        notifType,
        channel,
      },
    },
    update: updateData,
    create: {
      userId: auth.userId,
      notifType,
      channel,
      enabled: enabled ?? true,
      quietHoursEnabled: body.quietHoursEnabled ?? false,
      quietHoursStart: body.quietHoursStart ?? null,
      quietHoursEnd: body.quietHoursEnd ?? null,
    },
  });

  return Response.json(pref, NO_STORE);
}
