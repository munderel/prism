import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const item = await prisma.deliverableItem.findUnique({
    where: { id },
    include: { task: { select: { ownerId: true, assigneeId: true } } },
  });
  if (!item) return notFoundResponse('DeliverableItem');

  // Owner, assignee, or admin may mutate a deliverable item
  const { ownerId, assigneeId } = item.task;
  const isAdmin = auth.session.user.isAdmin;
  const canWrite = isAdmin || ownerId === auth.userId || assigneeId === auth.userId;
  if (!canWrite) return forbiddenResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  // Validate individual fields when present
  if (raw.text !== undefined) {
    if (typeof raw.text !== 'string' || !raw.text.trim()) {
      return Response.json({ error: 'text must be a non-empty string' }, { status: 400 });
    }
    raw.text = (raw.text as string).trim();
  }
  if (raw.isDone !== undefined && typeof raw.isDone !== 'boolean') {
    return Response.json({ error: 'isDone must be a boolean' }, { status: 400 });
  }
  if (raw.position !== undefined && (typeof raw.position !== 'number' || !Number.isInteger(raw.position) || (raw.position as number) < 0)) {
    return Response.json({ error: 'position must be a non-negative integer' }, { status: 400 });
  }

  const data = pickDefined<{ text: string; isDone: boolean; position: number }>(raw, [
    'text',
    'isDone',
    'position',
  ]);

  const updated = await prisma.deliverableItem.update({
    where: { id },
    data,
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const item = await prisma.deliverableItem.findUnique({
    where: { id },
    include: { task: { select: { ownerId: true, assigneeId: true } } },
  });
  if (!item) return notFoundResponse('DeliverableItem');

  const { ownerId, assigneeId } = item.task;
  const isAdmin = auth.session.user.isAdmin;
  const canWrite = isAdmin || ownerId === auth.userId || assigneeId === auth.userId;
  if (!canWrite) return forbiddenResponse();

  await prisma.deliverableItem.delete({ where: { id } });

  return new Response(null, { status: 204 });
}
