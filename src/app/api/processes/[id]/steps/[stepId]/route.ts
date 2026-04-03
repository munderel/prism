import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { regenerateAdvancedModeTasks } from '@/lib/process-task-generator';

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

  // Regenerate tasks if process is in ADVANCED mode
  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true } });
  if (process?.mode === 'ADVANCED') {
    regenerateAdvancedModeTasks(id).catch((err) => {
      console.error('[step-update] Failed to regenerate tasks:', err);
    });
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

  // Regenerate tasks if process is in ADVANCED mode
  const process = await prisma.process.findUnique({ where: { id }, select: { mode: true } });
  if (process?.mode === 'ADVANCED') {
    regenerateAdvancedModeTasks(id).catch((err) => {
      console.error('[step-delete] Failed to regenerate tasks:', err);
    });
  }

  return Response.json({ ok: true }, NO_STORE);
}
