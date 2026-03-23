import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const functions = await prisma.businessFunction.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      processes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          delegate: { select: { id: true, name: true, email: true } },
          _count: { select: { steps: true } },
        },
      },
    },
  });

  return Response.json(functions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  const fn = await prisma.businessFunction.create({
    data: { name, description: description || null },
  });

  return Response.json(fn, { status: 201 });
}
