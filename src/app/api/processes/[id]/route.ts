import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const process = await prisma.process.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
      steps: { orderBy: { sortOrder: 'asc' } },
      executions: {
        orderBy: { scheduledDate: 'desc' },
        take: 10,
        include: {
          executedBy: { select: { id: true, name: true } },
          task: { select: { id: true, status: true, completedAt: true } },
        },
      },
    },
  });

  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  return Response.json(process);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const body = await request.json();

  const process = await prisma.process.findUnique({ where: { id } });
  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  const isAdmin = auth.session.user.isAdmin;

  if (isAdmin) {
    // Admin can update all fields
    const { title, description, assigneeId, delegateId, delegateUntil, cadence, cadenceRule, defaultDurationMinutes } = body;

    if (defaultDurationMinutes !== undefined && (typeof defaultDurationMinutes !== 'number' || defaultDurationMinutes <= 0)) {
      return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
    }

    const updated = await prisma.process.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(delegateId !== undefined && { delegateId: delegateId || null }),
        ...(delegateUntil !== undefined && { delegateUntil: delegateUntil ? new Date(delegateUntil) : null }),
        ...(cadence !== undefined && { cadence }),
        ...(cadenceRule !== undefined && { cadenceRule }),
        ...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
      },
    });
    return Response.json(updated);
  }

  // Non-admin: can only update delegateId and delegateUntil on their own processes
  if (process.assigneeId !== auth.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { delegateId, delegateUntil } = body;
  const updated = await prisma.process.update({
    where: { id },
    data: {
      ...(delegateId !== undefined && { delegateId: delegateId || null }),
      ...(delegateUntil !== undefined && { delegateUntil: delegateUntil ? new Date(delegateUntil) : null }),
    },
  });

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.process.delete({ where: { id } });

  return Response.json({ success: true });
}
