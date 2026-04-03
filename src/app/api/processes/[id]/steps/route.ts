import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { regenerateAdvancedModeTasks } from '@/lib/process-task-generator';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

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
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { title, description, url, sortOrder } = body;

  if (!title || typeof title !== 'string') {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

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

  // Regenerate tasks if process is in ADVANCED mode
  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true } });
  if (process?.mode === 'ADVANCED') {
    regenerateAdvancedModeTasks(id).catch((err) => {
      console.error('[step-create] Failed to regenerate tasks:', err);
    });
  }

  return Response.json(step, { status: 201 });
}
