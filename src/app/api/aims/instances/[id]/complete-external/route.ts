import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAimToken, getBaseUrl } from '@/lib/completion-token';
import { htmlResponse as html } from '@/lib/html-response';
import { updateSpecificStreak, maybeIncrementDailyStreakIfDayComplete } from '@/lib/streak-engine';
import { applyBufferOnCompletion } from '@/lib/derailing-buffer';
import { recalculateUserAimProgress } from '@/lib/aim-progress';

const htmlResponse = (body: string, status = 200) => html(body, 'Aim Completion', status);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: aimInstanceId } = await params;
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');
  const userId = searchParams.get('userId');

  if (!token || !userId) {
    return htmlResponse(
      `<div class="icon">&#10060;</div>
       <h1>Missing Parameters</h1>
       <p>The completion link is invalid. Please try again from your calendar event.</p>`,
      400,
    );
  }

  const isValid = (() => {
    try { return verifyAimToken(aimInstanceId, userId, token); }
    catch { return false; }
  })();

  if (!isValid) {
    return htmlResponse(
      `<div class="icon">&#128274;</div>
       <h1>Unauthorized</h1>
       <p>This completion link is invalid or has been tampered with.</p>`,
      403,
    );
  }

  const aim = await prisma.aimInstance.findUnique({
    where: { id: aimInstanceId },
    include: { aimCategory: { select: { name: true } } },
  });

  if (!aim) {
    return htmlResponse(
      `<div class="icon">&#10067;</div>
       <h1>Aim Not Found</h1>
       <p>This aim instance no longer exists.</p>`,
      404,
    );
  }

  if (aim.userId !== userId) {
    return htmlResponse(
      `<div class="icon">&#128274;</div>
       <h1>Unauthorized</h1>
       <p>You are not the owner of this aim.</p>`,
      403,
    );
  }

  if (aim.status === 'COMPLETED') {
    return htmlResponse(
      `<div class="icon">&#9989;</div>
       <h1>Aim Was Already Completed</h1>
       <p><strong>${aim.aimCategory.name}</strong> was already marked as completed.</p>
       <a href="${getBaseUrl()}">Open Prism</a>`,
    );
  }

  await prisma.aimInstance.update({
    where: { id: aimInstanceId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  // Mirror the side-effects the in-app PATCH route fires on a SCHEDULED→COMPLETED
  // transition (src/app/api/aims/instances/[id]/route.ts:238-240 + progress
  // recalc). Without these, completing an aim via the calendar email link would
  // leave the per-aim streak, daily streak, derailing buffer, and userAim
  // aggregate progress out of sync. Phase progression (points/phaseAtCompletion)
  // is intentionally skipped here; it can be extracted into a shared helper
  // later if we want external completions to be fully equivalent.
  await Promise.allSettled([
    updateSpecificStreak(userId, `aim_${aim.aimCategoryId}`).catch((err) =>
      console.warn('[streak] aim streak update failed (external):', err),
    ),
    maybeIncrementDailyStreakIfDayComplete(userId).catch((err) =>
      console.warn('[streak] daily streak update failed (external):', err),
    ),
    applyBufferOnCompletion(userId, aim.aimCategoryId).catch((err) =>
      console.warn('[buffer] completion update failed (external):', err),
    ),
    recalculateUserAimProgress(userId, aim.aimCategoryId).catch((err) =>
      console.warn('[aims] progress recalc failed (external):', err),
    ),
  ]);

  return htmlResponse(
    `<div class="icon">&#127881;</div>
     <h1>Aim Marked Complete!</h1>
     <p>Nice work. <strong>${aim.aimCategory.name}</strong> has been marked as completed.</p>
     <a href="${getBaseUrl()}">Open Prism</a>`,
  );
}
