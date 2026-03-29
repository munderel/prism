import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

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
