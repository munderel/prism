import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { cleanupCurrentPeriodTasks } from '@/lib/process-task-generator';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id, stepId } = await params;
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;

  const step = await prisma.processStep.update({
    where: { id: stepId },
    data: pickDefined(parsed.data, ['title', 'description', 'url', 'sortOrder']),
  });

  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true, cadence: true } });
  if (process?.mode === 'ADVANCED') {
    await cleanupCurrentPeriodTasks(id, process.cadence as import('@prisma/client').ProcessCadence);
  }

  return Response.json(step, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id, stepId } = await params;

  await prisma.processStep.delete({ where: { id: stepId } });

  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true, cadence: true } });
  if (process?.mode === 'ADVANCED') {
    await cleanupCurrentPeriodTasks(id, process.cadence as import('@prisma/client').ProcessCadence);
  }

  return Response.json({ ok: true }, NO_STORE);
}
