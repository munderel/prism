import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { generateAdvancedModeTasks } from '@/lib/process-task-generator';

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
  const { title, description, cadence, assigneeId, defaultDurationMinutes, scheduledTime, scheduledDayOfWeek, scheduledDayOfMonth, mode, subtaskMode } = body;

  if (!title || typeof title !== 'string') {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  if (!scheduledTime || typeof scheduledTime !== 'string' || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
    return Response.json({ error: 'scheduledTime is required in HH:mm format' }, { status: 400 });
  }

  if (defaultDurationMinutes !== undefined && (typeof defaultDurationMinutes !== 'number' || defaultDurationMinutes <= 0)) {
    return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
  }

  // Validate ADVANCED mode requires an assignee
  if (mode === 'ADVANCED' && !assigneeId) {
    return Response.json({ error: 'ADVANCED mode requires an assignee' }, { status: 400 });
  }

  const process = await prisma.process.create({
    data: {
      functionId: id,
      title,
      description: description || null,
      cadence: cadence || 'WEEKLY',
      assigneeId: assigneeId || null,
      ...(mode && { mode }),
      ...(subtaskMode && { subtaskMode }),
      ...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
      ...(scheduledTime !== undefined && { scheduledTime: scheduledTime || null }),
      ...(scheduledDayOfWeek !== undefined && { scheduledDayOfWeek: scheduledDayOfWeek ?? null }),
      ...(scheduledDayOfMonth !== undefined && { scheduledDayOfMonth: scheduledDayOfMonth ?? null }),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  // For ADVANCED mode, pre-create tasks (fire-and-forget — steps may not exist yet)
  if (process.mode === 'ADVANCED') {
    generateAdvancedModeTasks(process.id).catch((err) => {
      console.error('[process-create] Failed to generate advanced tasks:', err);
    });
  }

  return Response.json(process, { status: 201, ...NO_STORE });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;

  const fn = await prisma.businessFunction.update({
    where: { id },
    data: pickDefined(parsed.data, ['name', 'description']),
  });

  return Response.json(fn, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.businessFunction.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
