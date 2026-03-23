import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { stepId } = await params;
  const body = await request.json();
  const { title, description, url, sortOrder } = body;

  const step = await prisma.processStep.update({
    where: { id: stepId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(url !== undefined && { url }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return Response.json(step);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { stepId } = await params;

  await prisma.processStep.delete({ where: { id: stepId } });

  return Response.json({ success: true });
}
