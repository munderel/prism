import { prisma } from '@/lib/prisma';
import { getEffectiveFrequency, type UserAimLike } from '@/lib/aim-phases';

/**
 * Beeminder-style safety buffer for aim derailing.
 *
 * Model:
 *   - Each aim carries `safetyBufferDays` — days of slack remaining before
 *     the user "derails" on the aim. New aims start at 7.
 *   - On completion: buffer grows by `1 / expectedPerDay` (i.e. completing
 *     one instance of a daily aim buys exactly 1 day of slack; completing
 *     one instance of a 3x/week aim buys ~2.3 days).
 *   - On day rollover: buffer shrinks by `expectedPerDay * elapsedDays`.
 *   - When buffer hits 0: `derailedAt` is set, UI shows "Derailed!" + a
 *     "Get back on track" CTA that clears `derailedAt` and resets buffer.
 *
 * Status thresholds:
 *   - derailed     : `derailedAt != null`
 *   - caution      : buffer < 1 day (within 24h of derailing)
 *   - on_track     : otherwise
 *
 * Buffer is capped at 30 to prevent unbounded accumulation from streaks.
 */

export type AimDerailStatus = 'on_track' | 'caution' | 'derailed';

export interface BufferDerailInfo {
  status: AimDerailStatus;
  message: string;
  safetyBufferDays: number;
  derailedAt: string | null;
  expectedPerDay: number;
}

const BUFFER_CAP_DAYS = 30;
/**
 * Days of buffer handed back when a user clicks "Get back on track." Kept
 * short on purpose: the user already missed their streak, so giving them a
 * full INITIAL_BUFFER_DAYS reset would remove the pressure that makes the
 * derail-and-recover loop meaningful. Three days is enough to complete the
 * aim at the typical ≤ 3x/week frequency before derailing again.
 */
const BACK_ON_TRACK_DAYS = 3;
const INITIAL_BUFFER_DAYS = 7;

interface BufferUserAimLike extends UserAimLike {
  id: string;
  isActive: boolean;
  safetyBufferDays: number;
  safetyBufferUpdatedAt: Date | string | null;
  derailedAt: Date | string | null;
  aimCategory: UserAimLike['aimCategory'] & { isDaily: boolean };
}

function expectedPerDayFor(userAim: BufferUserAimLike): number {
  if (userAim.aimCategory.isDaily) return 1;
  return getEffectiveFrequency(userAim) / 7;
}

/**
 * Compute the current buffer value given the stored buffer + elapsed time
 * since last update. Does NOT persist — callers that want the decay written
 * back to the DB should use `recomputeBuffer`.
 */
export function projectBuffer(
  userAim: BufferUserAimLike,
  now: Date = new Date(),
): { buffer: number; derailed: boolean } {
  if (!userAim.isActive) {
    return { buffer: userAim.safetyBufferDays, derailed: false };
  }
  const expectedPerDay = expectedPerDayFor(userAim);
  const last = userAim.safetyBufferUpdatedAt
    ? new Date(userAim.safetyBufferUpdatedAt).getTime()
    : now.getTime();
  const elapsedDays = Math.max(0, (now.getTime() - last) / (24 * 60 * 60 * 1000));
  const projected = userAim.safetyBufferDays - expectedPerDay * elapsedDays;
  if (projected <= 0) return { buffer: 0, derailed: true };
  return { buffer: projected, derailed: false };
}

export function computeBufferDerailInfo(
  userAim: BufferUserAimLike,
  now: Date = new Date(),
): BufferDerailInfo {
  const expectedPerDay = expectedPerDayFor(userAim);

  if (!userAim.isActive) {
    return {
      status: 'on_track',
      message: 'Aim is paused',
      safetyBufferDays: userAim.safetyBufferDays,
      derailedAt: userAim.derailedAt
        ? new Date(userAim.derailedAt).toISOString()
        : null,
      expectedPerDay,
    };
  }

  if (userAim.derailedAt) {
    return {
      status: 'derailed',
      message: 'Derailed! Get back on track to reset.',
      safetyBufferDays: 0,
      derailedAt: new Date(userAim.derailedAt).toISOString(),
      expectedPerDay,
    };
  }

  const { buffer, derailed } = projectBuffer(userAim, now);
  if (derailed) {
    return {
      status: 'derailed',
      message: 'Derailed! Get back on track to reset.',
      safetyBufferDays: 0,
      derailedAt: now.toISOString(),
      expectedPerDay,
    };
  }
  if (buffer < 1) {
    return {
      status: 'caution',
      message: 'Less than 24 hours until you derail — complete now.',
      safetyBufferDays: buffer,
      derailedAt: null,
      expectedPerDay,
    };
  }
  return {
    status: 'on_track',
    message: `${buffer.toFixed(1)} days of buffer remaining.`,
    safetyBufferDays: buffer,
    derailedAt: null,
    expectedPerDay,
  };
}

/**
 * Persist the projected buffer value to the DB. If the projection crossed
 * zero, set `derailedAt`.
 */
export async function recomputeBuffer(
  userAim: BufferUserAimLike,
  now: Date = new Date(),
): Promise<BufferDerailInfo> {
  const info = computeBufferDerailInfo(userAim, now);
  const updates: {
    safetyBufferDays: number;
    safetyBufferUpdatedAt: Date;
    derailedAt?: Date | null;
  } = {
    safetyBufferDays: info.safetyBufferDays,
    safetyBufferUpdatedAt: now,
  };
  if (info.status === 'derailed' && !userAim.derailedAt) {
    updates.derailedAt = now;
  }
  await prisma.userAim.update({ where: { id: userAim.id }, data: updates });
  return info;
}

/**
 * On AimInstance completion: add slack to the buffer. If the aim was
 * derailed, completion alone does NOT un-derail — the user must explicitly
 * hit "Get back on track." This prevents silently masking failures.
 */
export async function applyBufferOnCompletion(
  userId: string,
  aimCategoryId: string,
  now: Date = new Date(),
): Promise<void> {
  const userAim = await prisma.userAim.findFirst({
    where: { userId, aimCategoryId },
    include: { aimCategory: true },
  });
  if (!userAim || !userAim.isActive) return;

  const ua = userAim as unknown as BufferUserAimLike;
  const { buffer } = projectBuffer(ua, now);
  const expectedPerDay = expectedPerDayFor(ua);
  const gain = expectedPerDay > 0 ? 1 / expectedPerDay : 1;
  const nextBuffer = Math.min(BUFFER_CAP_DAYS, buffer + gain);

  await prisma.userAim.update({
    where: { id: userAim.id },
    data: {
      safetyBufferDays: nextBuffer,
      safetyBufferUpdatedAt: now,
    },
  });
}

/**
 * "Get back on track" action: clear derailedAt and reset buffer to a small
 * positive value so the user has a fresh chance before derailing again.
 */
export async function backOnTrack(userAimId: string, now: Date = new Date()): Promise<void> {
  await prisma.userAim.update({
    where: { id: userAimId },
    data: {
      derailedAt: null,
      safetyBufferDays: BACK_ON_TRACK_DAYS,
      safetyBufferUpdatedAt: now,
    },
  });
}

export const DERAILING_BUFFER_DEFAULTS = {
  INITIAL_BUFFER_DAYS,
  BUFFER_CAP_DAYS,
  BACK_ON_TRACK_DAYS,
};
