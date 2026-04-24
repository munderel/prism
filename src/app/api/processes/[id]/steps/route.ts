import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { authorizeProcessAccess } from '@/lib/api-helpers';
import { parseBody, createProcessStepSchema } from '@/lib/schemas';
import { cleanupCurrentPeriodTasks } from '@/lib/process-task-generator';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const steps = await prisma.processStep.findMany({
    where: { processId: id },
    orderBy: { sortOrder: 'asc' },
  });

  return Response.json(steps);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await parseBody(request, createProcessStepSchema);
  if ('error' in parsed) return parsed.error;
  const { title, description, url, sortOrder } = parsed.data;

  let order = sortOrder;
  if (order === undefined) {
    const lastStep = await prisma.processStep.findFirst({
      where: { processId: id },
      orderBy: { sortOrder: 'desc' },
    });
    order = lastStep ? lastStep.sortOrder + 1 : 0;
  }

  const step = await prisma.processStep.create({
    data: {
      processId: id,
      title,
      description: description || null,
      url: url || null,
      sortOrder: order,
    },
  });

  // Invalidate current-period TODO tasks so checker recreates them with the new step
  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true, cadence: true } });
  if (process?.mode === 'ADVANCED') {
    await cleanupCurrentPeriodTasks(id, process.cadence as import('@prisma/client').ProcessCadence);
  }

  return Response.json(step, { status: 201 });
}
