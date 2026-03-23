import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const body = await request.json();
  const { title, description, cadence, assigneeId } = body;

  if (!title || typeof title !== 'string') {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const process = await prisma.process.create({
    data: {
      functionId: id,
      title,
      description: description || null,
      cadence: cadence || 'WEEKLY',
      assigneeId: assigneeId || null,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(process, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const body = await request.json();
  const { name, description } = body;

  const fn = await prisma.businessFunction.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  });

  return Response.json(fn);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.businessFunction.delete({ where: { id } });

  return Response.json({ success: true });
}
