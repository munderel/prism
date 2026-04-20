import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateWorkBlockSchema } from '@/lib/schemas';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const block = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
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
    select: { id: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.start !== undefined) data.start = new Date(body.start);
  if (body.end !== undefined) data.end = new Date(body.end);
  if (body.mainObjective !== undefined) data.mainObjective = body.mainObjective;
  if (body.completionStatus !== undefined) {
    data.completionStatus = body.completionStatus;
    if (body.completionStatus !== 'PENDING') data.reviewedAt = new Date();
  }
  if (body.actualMinutes !== undefined) data.actualMinutes = body.actualMinutes;
  if (body.notes !== undefined) data.notes = body.notes;

  const block = await prisma.workBlock.update({
    where: { id },
    data,
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
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
    select: { id: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  await prisma.workBlock.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
