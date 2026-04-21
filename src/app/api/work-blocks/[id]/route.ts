import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, requireTaskAccess } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateWorkBlockSchema } from '@/lib/schemas';

const blockInclude = {
  task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
  clearGoals: { orderBy: { sortOrder: 'asc' as const } },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const block = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    include: blockInclude,
  });
  if (!block) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(block, NO_STORE);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const parsed = await parseBody(request, updateWorkBlockSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, taskId: true, start: true, end: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  // Re-verify task access — the task may have been reassigned since the block
  // was created, in which case the current user should no longer mutate it.
  const taskAccess = await requireTaskAccess(existing.taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  // Guard against updates that would leave end <= start on the row as a whole.
  // The zod schema checks the pair when both are provided; here we re-check
  // against the stored values when only one side of the pair is updated.
  const resolvedStart = body.start !== undefined ? new Date(body.start) : existing.start;
  const resolvedEnd = body.end !== undefined ? new Date(body.end) : existing.end;
  if (resolvedEnd <= resolvedStart) {
    return Response.json({ error: 'end must be after start' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.start !== undefined) data.start = resolvedStart;
  if (body.end !== undefined) data.end = resolvedEnd;
  if (body.mainObjective !== undefined) data.mainObjective = body.mainObjective;
  if (body.completionStatus !== undefined) {
    data.completionStatus = body.completionStatus;
    if (body.completionStatus !== 'PENDING') data.reviewedAt = new Date();
  }
  if (body.actualMinutes !== undefined) data.actualMinutes = body.actualMinutes;
  if (body.notes !== undefined) data.notes = body.notes;

  const block = await prisma.$transaction(async (tx) => {
    const updated = await tx.workBlock.update({ where: { id }, data });
    if (body.subGoals !== undefined) {
      await tx.clearGoal.deleteMany({ where: { workBlockId: id } });
      if (body.subGoals.length > 0) {
        await tx.clearGoal.createMany({
          data: body.subGoals.map((text, idx) => ({
            taskId: updated.taskId,
            workBlockId: id,
            text,
            sortOrder: idx,
          })),
        });
      }
    }
    return tx.workBlock.findUnique({
      where: { id },
      include: blockInclude,
    });
  });

  return Response.json(block, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const existing = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, taskId: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  // Re-verify task access before removing.
  const taskAccess = await requireTaskAccess(existing.taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  await prisma.workBlock.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
