import type { PrismaClient } from '@prisma/client';

// Brute-force lockout for credential logins. Before this module, User
// carried an isLockedOut flag that nothing ever wrote, and the LoginAttempt
// table existed but was untouched by the auth path — so the review's #1
// Critical was effectively cosmetic. This module wires both:
//
// 1. Every credential attempt is recorded in LoginAttempt.
// 2. After MAX_FAILURES failures inside FAILURE_WINDOW_MS, the user is
//    locked (isLockedOut=true, lockoutUntil=now + LOCKOUT_DURATION_MS).
// 3. On every subsequent attempt, an expired lockoutUntil auto-clears so
//    no cron is needed.
// 4. Successful logins leave the attempt history alone; the window naturally
//    expires failed attempts older than FAILURE_WINDOW_MS.
//
// Tuned so that a typo or two doesn't lock a user out, but a scripted
// attacker burns themselves in a few seconds.

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LockoutStatus {
  locked: boolean;
  until?: Date;
}

/**
 * Check whether `email` is currently locked out. Also auto-clears an
 * expired lockout so callers never see stale state.
 */
export async function checkLockout(
  prisma: Pick<PrismaClient, 'user'>,
  email: string,
  now: Date = new Date(),
): Promise<LockoutStatus> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isLockedOut: true, lockoutUntil: true },
  });
  if (!user) return { locked: false };
  if (!user.isLockedOut) return { locked: false };
  if (user.lockoutUntil && user.lockoutUntil.getTime() > now.getTime()) {
    return { locked: true, until: user.lockoutUntil };
  }
  // Expired — auto-clear so the next attempt goes through normally.
  await prisma.user.update({
    where: { id: user.id },
    data: { isLockedOut: false, lockoutUntil: null },
  });
  return { locked: false };
}

/**
 * Record a login attempt and, on failure, lock the user if the window
 * threshold is crossed. Returns the post-record status so the caller can
 * surface "your account is now locked" messages without a second query.
 *
 * Accepts a `prisma` slice so tests can pass a narrow mock.
 */
export async function recordLoginAttempt(
  prisma: Pick<PrismaClient, 'loginAttempt' | 'user'>,
  input: { email: string; success: boolean },
  now: Date = new Date(),
): Promise<LockoutStatus> {
  await prisma.loginAttempt.create({
    data: { email: input.email, success: input.success, createdAt: now },
  });

  if (input.success) return { locked: false };

  const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      email: input.email,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (recentFailures < MAX_FAILURES) return { locked: false };

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) return { locked: false }; // unknown emails don't get a lock row

  const lockoutUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
  await prisma.user.update({
    where: { id: user.id },
    data: { isLockedOut: true, lockoutUntil },
  });
  return { locked: true, until: lockoutUntil };
}
