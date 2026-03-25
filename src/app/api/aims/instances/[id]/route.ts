import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import {
  getPointsPerCompletion,
  evaluatePhaseGraduation,
  calculateAimStreak,
  type AimPhase,
} from '@/lib/aim-phases';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Verify instance exists and belongs to user
  const existing = await prisma.aimInstance.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'AimInstance not found' }, { status: 404 });
  }
  if (existing.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { status, timeBlockStart, timeBlockEnd, isGroupOpen, activityNote, selectedActivity, taskIds } = body;

  // Handle task assignment (Deep Work as task container)
  if (taskIds !== undefined) {
    if (!Array.isArray(taskIds)) {
      return Response.json({ error: 'taskIds must be an array' }, { status: 400 });
    }

    // Clear previously assigned tasks that are no longer in the list
    await prisma.task.updateMany({
      where: {
        aimInstanceId: id,
        id: { notIn: taskIds },
      },
      data: { aimInstanceId: null },
    });

    // Assign new tasks to this instance
    if (taskIds.length > 0) {
      await prisma.task.updateMany({
        where: {
          id: { in: taskIds },
          ownerId: auth.userId,
        },
        data: { aimInstanceId: id },
      });
    }

    // If only taskIds was sent, return the updated instance with tasks
    if (status === undefined && timeBlockStart === undefined && timeBlockEnd === undefined
        && isGroupOpen === undefined && activityNote === undefined && selectedActivity === undefined) {
      const instance = await prisma.aimInstance.findUnique({
        where: { id },
        include: { aimCategory: true, tasks: { select: { id: true, title: true, status: true } } },
      });
      return Response.json(instance);
    }
  }

  const updateData: Record<string, any> = {};

  if (status !== undefined) {
    const validStatuses = ['SCHEDULED', 'COMPLETED', 'SKIPPED'];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
    updateData.status = status;
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
  }

  if (timeBlockStart !== undefined) {
    updateData.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  }

  if (timeBlockEnd !== undefined) {
    updateData.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;
  }

  if (isGroupOpen !== undefined) {
    updateData.isGroupOpen = isGroupOpen;
  }

  if (activityNote !== undefined) {
    updateData.activityNote = activityNote;
  }

  if (selectedActivity !== undefined) {
    updateData.selectedActivity = selectedActivity;
  }

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

      // Calculate points
      const points = getPointsPerCompletion(phase);
      updateData.pointsEarned = points;
      updateData.phaseAtCompletion = phase;

      // Update streak
      const { newStreak } = calculateAimStreak(
        userAim.currentStreak,
        userAim.lastCompletedAt,
        phase,
      );

      // Get recent instances for phase graduation evaluation
      const sixWeeksAgo = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000);
      const recentInstances = await prisma.aimInstance.findMany({
        where: {
          userId: existing.userId,
          aimCategoryId: existing.aimCategoryId,
          scheduledDate: { gte: sixWeeksAgo },
        },
        select: { status: true, scheduledDate: true },
      });

      // Check phase graduation
      const newPhase = evaluatePhaseGraduation(
        phase,
        userAim.phaseStartedAt,
        userAim.completionCount + 1,
        recentInstances,
      );

      // Update UserAim
      await prisma.userAim.update({
        where: { id: userAim.id },
        data: {
          completionCount: { increment: 1 },
          currentStreak: newStreak,
          bestStreak: Math.max(userAim.bestStreak, newStreak),
          lastCompletedAt: new Date(),
          ...(newPhase ? {
            currentPhase: newPhase,
            phaseStartedAt: new Date(),
          } : {}),
        },
      });
    }
  }

  const updated = await prisma.aimInstance.update({
    where: { id },
    data: updateData,
    include: { aimCategory: true, tasks: { select: { id: true, title: true, status: true } } },
  });

  return Response.json(updated);
}
