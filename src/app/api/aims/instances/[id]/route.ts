import { NextRequest } from 'next/server';
import { toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, updateAimInstanceSchema } from '@/lib/schemas';
import {
  getPointsPerCompletion,
  evaluatePhaseGraduation,
  type AimPhase,
} from '@/lib/aim-phases';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { getAimCompletionUrl } from '@/lib/completion-token';
import { updateSpecificStreak, updateDailyStreak, type StreakUpdateResult } from '@/lib/streak-engine';

const INSTANCE_INCLUDE = {
  aimCategory: true,
  tasks: { select: { id: true, title: true, status: true } },
} as const;


/**
 * Recalculate aim progress using "consecutive weeks on-target" streaks.
 *
 * Weeks are Mon-Sun in the user's timezone. A week is "on-target" when the
 * number of completed instances that week >= the aim's frequency
 * (customFrequency ?? defaultFrequency). The streak counts consecutive
 * on-target weeks. If the current week isn't on-target yet, the streak
 * reflects the run ending at the most recent fully on-target week.
 */
async function recalculateUserAimProgress(userId: string, aimCategoryId: string) {
  const userAim = await prisma.userAim.findUnique({
    where: { userId_aimCategoryId: { userId, aimCategoryId } },
    include: { aimCategory: { select: { defaultFrequency: true } } },
  });
  if (!userAim) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? 'America/New_York';

  const frequency = userAim.customFrequency ?? userAim.aimCategory.defaultFrequency;

  const completedInstances = await prisma.aimInstance.findMany({
    where: { userId, aimCategoryId, status: 'COMPLETED' },
    orderBy: { scheduledDate: 'asc' },
    select: { scheduledDate: true, completedAt: true },
  });

  // Bucket completions by Mon-Sun week key (ISO week start date)
  const weekCounts = new Map<string, number>();
  for (const inst of completedInstances) {
    const d = toZonedTime(new Date(inst.scheduledDate), timezone);
    // Shift so Monday = 0
    const dayOfWeek = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }

  // Sort week keys chronologically
  const sortedWeeks = Array.from(weekCounts.keys()).sort();

  // Count consecutive on-target weeks
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;
  let previousMonday: Date | null = null;

  for (const weekKey of sortedWeeks) {
    const count = weekCounts.get(weekKey)!;
    const [y, m, d] = weekKey.split('-').map(Number);
    const thisMonday = new Date(y, m - 1, d);

    if (count < frequency) {
      // Week not on-target — break the streak
      runningStreak = 0;
      previousMonday = thisMonday;
      continue;
    }

    // On-target week
    if (!previousMonday) {
      runningStreak = 1;
    } else {
      const diffDays = Math.round((thisMonday.getTime() - previousMonday.getTime()) / 86400000);
      runningStreak = diffDays === 7 ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    currentStreak = runningStreak;
    previousMonday = thisMonday;
  }

  // If the most recent on-target week isn't this week or last week, streak is broken
  if (sortedWeeks.length > 0 && currentStreak > 0) {
    const now = toZonedTime(new Date(), timezone);
    const todayDow = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - todayDow);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    const lastOnTargetKey = sortedWeeks.filter(k => weekCounts.get(k)! >= frequency).pop();
    if (lastOnTargetKey) {
      const [y, m, d] = lastOnTargetKey.split('-').map(Number);
      const lastOnTargetMonday = new Date(y, m - 1, d);
      if (lastOnTargetMonday < lastMonday) {
        currentStreak = 0;
      }
    }
  }

  await prisma.userAim.update({
    where: { id: userAim.id },
    data: {
      completionCount: completedInstances.length,
      currentStreak,
      bestStreak,
      lastCompletedAt: completedInstances[completedInstances.length - 1]?.scheduledDate ?? null,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.aimInstance.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'AimInstance not found' }, { status: 404 });
  }
  if (existing.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(request, updateAimInstanceSchema);
  if ('error' in parsed) return parsed.error;
  const { status, timeBlockStart, timeBlockEnd, isGroupOpen, activityNote, selectedActivity, taskIds } = parsed.data;

  // Handle task assignment (Deep Work as task container)
  if (taskIds !== undefined) {
    await prisma.task.updateMany({
      where: { aimInstanceId: id, id: { notIn: taskIds } },
      data: { aimInstanceId: null },
    });

    if (taskIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: taskIds }, ownerId: auth.userId },
        data: { aimInstanceId: id },
      });
    }

    // If only taskIds was sent, return early
    const hasOtherFields = status !== undefined || timeBlockStart !== undefined
      || timeBlockEnd !== undefined || isGroupOpen !== undefined
      || activityNote !== undefined || selectedActivity !== undefined;

    if (!hasOtherFields) {
      const instance = await prisma.aimInstance.findUnique({
        where: { id },
        include: INSTANCE_INCLUDE,
      });
      return Response.json(instance);
    }
  }

  const updateData: Record<string, any> = {};

  if (status !== undefined) {
    updateData.status = status;
    updateData.completedAt = status === 'COMPLETED' ? new Date() : null;
  }

  if (timeBlockStart !== undefined) {
    updateData.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  }
  if (timeBlockEnd !== undefined) {
    updateData.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;
  }
  if (isGroupOpen !== undefined) updateData.isGroupOpen = isGroupOpen;
  if (activityNote !== undefined) updateData.activityNote = activityNote;
  if (selectedActivity !== undefined) updateData.selectedActivity = selectedActivity;

  let beeminderError: string | undefined;

  // Handle phase progression and scoring when completing an aim
  if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    const userAim = await prisma.userAim.findUnique({
      where: {
        userId_aimCategoryId: {
          userId: existing.userId,
          aimCategoryId: existing.aimCategoryId,
        },
      },
      include: { aimCategory: true },
    });

    if (userAim) {
      const phase = (userAim.currentPhase || 'SEED') as AimPhase;
      updateData.pointsEarned = getPointsPerCompletion(phase);
      updateData.phaseAtCompletion = phase;

      const sixWeeksAgo = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000);
      const recentInstances = await prisma.aimInstance.findMany({
        where: {
          userId: existing.userId,
          aimCategoryId: existing.aimCategoryId,
          scheduledDate: { gte: sixWeeksAgo },
        },
        select: { status: true, scheduledDate: true },
      });

      const newPhase = evaluatePhaseGraduation(
        phase,
        userAim.phaseStartedAt,
        userAim.completionCount + 1,
        recentInstances,
      );

      if (newPhase) {
        await prisma.userAim.update({
          where: { id: userAim.id },
          data: { currentPhase: newPhase, phaseStartedAt: new Date() },
        });
      }
    }

    // Update streak records — await both so failures are visible
    await updateSpecificStreak(existing.userId, `aim_${existing.aimCategoryId}`).catch((err) => console.warn('[streak] aim streak update failed:', err));
    const streakResult = await updateDailyStreak(existing.userId, 'aims').catch((err) => { console.warn('[streak] daily streak update failed:', err); return {} as StreakUpdateResult; });
    if (streakResult?.beeminder?.ok === false) {
      beeminderError = streakResult.beeminder.error;
    }
  }

  const updated = await prisma.aimInstance.update({
    where: { id },
    data: updateData,
    include: INSTANCE_INCLUDE,
  });

  if (status !== undefined && status !== existing.status) {
    await recalculateUserAimProgress(existing.userId, existing.aimCategoryId);
  }

  // Google Calendar sync — fire-and-forget
  const calendarFieldsChanged = status !== undefined || timeBlockStart !== undefined || timeBlockEnd !== undefined;
  if (calendarFieldsChanged) {
    const syncToGcal = async () => {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(existing.userId);
      if (!hasGoogle) return;
      const newStart = updated.timeBlockStart;
      const newEnd = updated.timeBlockEnd;
      const title = updated.selectedActivity
        ? `${updated.aimCategory.name}: ${updated.selectedActivity}`
        : updated.aimCategory.name;

      if ((status === 'COMPLETED' || status === 'SKIPPED') && existing.calendarEventId) {
        await deleteGoogleEvent(existing.userId, existing.calendarEventId, targetCalendarId);
        await prisma.aimInstance.update({ where: { id }, data: { calendarEventId: null } });
      } else if (existing.calendarEventId && (timeBlockStart !== undefined || timeBlockEnd !== undefined)) {
        await updateGoogleEvent(existing.userId, existing.calendarEventId, {
          summary: title,
          start: newStart ? newStart.toISOString() : undefined,
          end: newEnd ? newEnd.toISOString() : undefined,
        }, targetCalendarId);
      } else if (!existing.calendarEventId && newStart && newEnd && status !== 'COMPLETED' && status !== 'SKIPPED') {
        const completionUrl = getAimCompletionUrl(id, existing.userId);
        const gcalEvent = await createGoogleEvent(existing.userId, {
          summary: title,
          description: `Mark complete in Prism: ${completionUrl}`,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
        }, targetCalendarId);
        if (gcalEvent?.id) {
          await prisma.aimInstance.update({ where: { id }, data: { calendarEventId: gcalEvent.id } });
        }
      }
    };
    try { await syncToGcal(); } catch (err) { console.warn('[aims] Google Calendar sync failed:', err); }
  }

  return Response.json({ ...updated, beeminderError });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.aimInstance.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'AimInstance not found' }, { status: 404 });
  }
  if (existing.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete linked Google Calendar event
  if (existing.calendarEventId) {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(existing.userId);
    if (hasGoogle) {
      await deleteGoogleEvent(existing.userId, existing.calendarEventId, targetCalendarId).catch((err) => {
        console.warn('[aims] Failed to delete GCal event on aim delete:', err);
      });
    }
  }

  // Disconnect any linked tasks before deleting
  await prisma.task.updateMany({
    where: { aimInstanceId: id },
    data: { aimInstanceId: null },
  });

  await prisma.aimInstance.delete({ where: { id } });

  return Response.json({ ok: true });
}
