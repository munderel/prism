import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

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
  const { title, description, cadence, assigneeId, defaultDurationMinutes } = body;

  if (!title || typeof title !== 'string') {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  if (defaultDurationMinutes !== undefined && (typeof defaultDurationMinutes !== 'number' || defaultDurationMinutes <= 0)) {
    return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
  }

  const process = await prisma.process.create({
    data: {
      functionId: id,
      title,
      description: description || null,
      cadence: cadence || 'WEEKLY',
      assigneeId: assigneeId || null,
      ...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(process, { status: 201, headers: { 'Cache-Control': 'no-store' } });
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
  const body = parsed.data;
  const { name, description } = body;

  const fn = await prisma.businessFunction.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  });

  return Response.json(fn, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.businessFunction.delete({ where: { id } });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
