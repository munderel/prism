import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { stepId } = await params;
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
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

  return Response.json(step, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { stepId } = await params;

  await prisma.processStep.delete({ where: { id: stepId } });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
