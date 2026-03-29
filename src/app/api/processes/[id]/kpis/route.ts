import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';

async function authorizeProcessAccess(processId: string, userId: string, isAdmin: boolean) {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    select: { id: true, assigneeId: true, delegateId: true },
  });
  if (!process) return { error: 'not_found' as const };
  if (isAdmin || process.assigneeId === userId || process.delegateId === userId) {
    return { process };
  }
  return { error: 'forbidden' as const };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

  const kpis = await prisma.processKpi.findMany({
    where: { processId: id },
    include: {
      entries: {
        orderBy: { date: 'desc' },
        take: 30,
        include: { user: { select: { id: true, name: true } } },
      },
      goals: true,
      goal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(kpis);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

  const body = await request.json();
  const { name, unit, targetValue, goalId } = body;

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  const kpi = await prisma.processKpi.create({
    data: {
      processId: id,
      name,
      unit: unit || null,
      targetValue: targetValue ?? null,
      goalId: goalId || null,
    },
  });

  return Response.json(kpi, { status: 201 });
}
