import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';


export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const stacks = await prisma.goalStack.findMany({
    where: {
      OR: [
        { ownerId: auth.userId },
        { isCompany: true },
      ],
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      _count: { select: { goals: true } },
    },
    orderBy: [{ isCompany: 'desc' }, { createdAt: 'asc' }],
  });

  return new Response(JSON.stringify(stacks), {
    headers: cacheHeaders(30, 120),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, isCompany } = body;

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'Name is required' }, { status: 400 });
  }

  if (isCompany) {
    const auth = await requireAdmin();
    if ('error' in auth) return authError(auth);

    const stack = await prisma.goalStack.create({
      data: { name, isCompany: true, ownerId: auth.userId },
    });
    return Response.json(stack, { status: 201 });
  }

  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const stack = await prisma.goalStack.create({
    data: { name, isCompany: false, ownerId: auth.userId },
  });
  return Response.json(stack, { status: 201 });
}
