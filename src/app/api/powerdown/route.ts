import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find or return today's session
  const session = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: today },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    return Response.json(null);
  }

  return Response.json(session);
}

export async function POST(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for existing session today
  const existing = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: today },
      completedAt: null,
    },
  });

  if (existing) {
    return Response.json(existing);
  }

  const session = await prisma.powerdownSession.create({
    data: {
      userId: auth.userId,
      sessionDate: today,
    },
  });

  return Response.json(session, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { sessionId, currentStep, checklistState, tomorrowPlan, distractions, gratitudes, ideas, clearGoals, complete } = body;

  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const session = await prisma.powerdownSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const data: any = {};
  if (currentStep !== undefined) data.currentStep = currentStep;
  if (checklistState !== undefined) data.checklistState = checklistState;
  if (tomorrowPlan !== undefined) data.tomorrowPlan = tomorrowPlan;
  if (distractions !== undefined) data.distractions = distractions;
  if (gratitudes !== undefined) data.gratitudes = gratitudes;
  if (ideas !== undefined) data.ideas = ideas;
  if (clearGoals !== undefined) data.clearGoals = clearGoals;
  if (complete) data.completedAt = new Date();

  const updated = await prisma.powerdownSession.update({ where: { id: sessionId }, data });
  return Response.json(updated);
}
