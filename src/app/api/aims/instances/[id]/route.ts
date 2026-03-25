import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

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
  const { status, timeBlockStart, timeBlockEnd, isGroupOpen, activityNote } = body;

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

  const updated = await prisma.aimInstance.update({
    where: { id },
    data: updateData,
    include: { aimCategory: true },
  });

  return Response.json(updated);
}
