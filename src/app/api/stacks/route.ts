import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { cacheHeaders, safeParseJson, NO_STORE } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const stacks = await prisma.goalStack.findMany({
    where: {
      OR: [
        { ownerId: auth.userId },
        { isCompany: true },
        { visibility: 'group' },
        { visibility: 'company' },
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
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { name, isCompany, visibility } = parsed.data;

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'Name is required' }, { status: 400 });
  }

  const requiresAdmin = isCompany || visibility === 'company' || visibility === 'group';
  const auth = requiresAdmin ? await requireAdmin() : await requireAuth();
  if ('error' in auth) return authError(auth);

  const stack = await prisma.goalStack.create({
    data: {
      name,
      isCompany: requiresAdmin ? (isCompany || visibility === 'company') : false,
      visibility: requiresAdmin ? (visibility || (isCompany ? 'company' : 'group')) : 'private',
      ownerId: auth.userId,
    },
  });

  return Response.json(stack, { status: 201, ...NO_STORE });
}
