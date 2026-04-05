import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import {
  getPointsPerCompletion,
  evaluatePhaseGraduation,
  calculateAimStreak,
  type AimPhase,
} from '@/lib/aim-phases';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { getAimCompletionUrl } from '@/lib/completion-token';

const INSTANCE_INCLUDE = {
  aimCategory: true,
  tasks: { select: { id: true, title: true, status: true } },
} as const;

const VALID_STATUSES = ['SCHEDULED', 'COMPLETED', 'SKIPPED'] as const;

async function recalculateUserAimProgress(userId: string, aimCategoryId: string) {
  const userAim = await prisma.userAim.findUnique({
    where: {
      userId_aimCategoryId: {
        userId,
        aimCategoryId,
      },
    },
  });

  if (!userAim) return;

  const completedInstances = await prisma.aimInstance.findMany({
    where: {
      userId,
      aimCategoryId,
      status: 'COMPLETED',
    },
    orderBy: { scheduledDate: 'asc' },
    select: { scheduledDate: true, completedAt: true },
  });

  const uniqueCompletionDates: string[] = [];
  for (const instance of completedInstances) {
    const date = new Date(instance.scheduledDate);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (uniqueCompletionDates[uniqueCompletionDates.length - 1] !== key) {
      uniqueCompletionDates.push(key);
    }
  }

  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;

  for (const key of uniqueCompletionDates) {
    const [year, month, day] = key.split('-').map(Number);
    const currentDate = new Date(year, month, day);
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const diffDays = Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000);
      runningStreak = diffDays === 1 ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    currentStreak = runningStreak;
    previousDate = currentDate;
  }

  await prisma.userAim.update({
    where: { id: userAim.id },
    data: {
      completionCount: completedInstances.length,
      currentStreak,
      bestStreak,
      lastCompletedAt: completedInstances[completedInstances.length - 1]?.completedAt ?? null,
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

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { status, timeBlockStart, timeBlockEnd, isGroupOpen, activityNote, selectedActivity, taskIds } = parsed.data;

  // Handle task assignment (Deep Work as task container)
  if (taskIds !== undefined) {
    if (!Array.isArray(taskIds)) {
      return Response.json({ error: 'taskIds must be an array' }, { status: 400 });
    }

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
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
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

      const { newStreak } = calculateAimStreak(
        userAim.currentStreak,
        userAim.lastCompletedAt,
        phase,
      );

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

      await prisma.userAim.update({
        where: { id: userAim.id },
        data: {
          completionCount: { increment: 1 },
          currentStreak: newStreak,
          bestStreak: Math.max(userAim.bestStreak, newStreak),
          lastCompletedAt: new Date(),
          ...(newPhase ? { currentPhase: newPhase, phaseStartedAt: new Date() } : {}),
        },
      });
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

  return Response.json(updated);
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
