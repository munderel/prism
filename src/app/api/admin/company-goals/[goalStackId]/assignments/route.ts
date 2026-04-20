import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { notFoundResponse } from '@/lib/api-helpers';

const assignSchema = z.object({
  userId: z.string().min(1),
  notes: z.string().max(500).optional().nullable(),
});

/** GET — list assignments for a company goal (admin only). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ goalStackId: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);
  const { goalStackId } = await params;

  const stack = await prisma.goalStack.findUnique({
    where: { id: goalStackId },
    select: { id: true, isCompany: true },
  });
  if (!stack || !stack.isCompany) return notFoundResponse('Company goal');

  const assignments = await prisma.companyGoalAssignment.findMany({
    where: { goalStackId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { assignedAt: 'asc' },
  });
  return Response.json({ assignments });
}

/** POST — assign a user to a company goal (admin only). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ goalStackId: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);
  const { goalStackId } = await params;

  const stack = await prisma.goalStack.findUnique({
    where: { id: goalStackId },
    select: { id: true, isCompany: true },
  });
  if (!stack || !stack.isCompany) return notFoundResponse('Company goal');

  const parsed = await parseBody(request, assignSchema);
  if ('error' in parsed) return parsed.error;
  const { userId, notes } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) return notFoundResponse('User');

  const assignment = await prisma.companyGoalAssignment.upsert({
    where: { goalStackId_userId: { goalStackId, userId } },
    create: {
      goalStackId,
      userId,
      assignedById: auth.userId,
      notes: notes ?? null,
    },
    update: { notes: notes ?? null },
  });
  return Response.json(assignment);
}
