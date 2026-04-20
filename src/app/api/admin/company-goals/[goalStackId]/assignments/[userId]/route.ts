import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';

/** DELETE — unassign a user from a company goal (admin only). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ goalStackId: string; userId: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);
  const { goalStackId, userId } = await params;

  const existing = await prisma.companyGoalAssignment.findUnique({
    where: { goalStackId_userId: { goalStackId, userId } },
  });
  if (!existing) return notFoundResponse('Assignment');

  await prisma.companyGoalAssignment.delete({ where: { id: existing.id } });
  return Response.json({ ok: true });
}
