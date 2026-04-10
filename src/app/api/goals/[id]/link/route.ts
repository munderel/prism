import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';
import { parseBody, linkGoalSchema } from '@/lib/schemas';
import { cascadeProgressUp } from '@/lib/progress';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyGoalId } = await params;
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, linkGoalSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { individualGoalId, weight } = body;

  // Validate company goal is in a company stack
  const companyGoal = await prisma.goal.findUnique({
    where: { id: companyGoalId },
    include: { stack: true },
  });

  if (!companyGoal || companyGoal.deletedAt || !companyGoal.stack.isCompany) {
    return Response.json(
      { error: 'Company goal must be in a company stack' },
      { status: 400 }
    );
  }

  // Validate individual goal is in a personal stack
  const individualGoal = await prisma.goal.findUnique({
    where: { id: individualGoalId },
    include: { stack: true },
  });

  if (!individualGoal || individualGoal.deletedAt || individualGoal.stack.isCompany) {
    return Response.json(
      { error: 'Individual goal must be in a personal stack' },
      { status: 400 }
    );
  }

  const link = await prisma.goalLink.create({
    data: {
      companyGoalId,
      individualGoalId,
      weight: weight ?? 1.0,
    },
  });

  await cascadeProgressUp(companyGoalId);

  return Response.json(link, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyGoalId } = await params;
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get('linkId');

  if (!linkId) {
    return Response.json({ error: 'linkId query param is required' }, { status: 400 });
  }

  const link = await prisma.goalLink.findUnique({ where: { id: linkId } });
  if (!link || link.companyGoalId !== companyGoalId) return notFoundResponse('Link');

  await prisma.goalLink.delete({ where: { id: linkId } });
  await cascadeProgressUp(companyGoalId);

  return Response.json({ ok: true });
}
