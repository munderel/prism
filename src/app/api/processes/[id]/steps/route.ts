import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

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
  const body = await request.json();
  const { title, description, url, sortOrder } = body;

  if (!title || typeof title !== 'string') {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  // If no sortOrder provided, put it at the end
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

  return Response.json(step, { status: 201 });
}
