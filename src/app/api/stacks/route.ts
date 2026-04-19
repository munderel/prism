import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createStackSchema } from '@/lib/schemas';

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

  return Response.json(stacks, NO_STORE);
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, createStackSchema);
  if ('error' in parsed) return parsed.error;
  const { name, isCompany, visibility } = parsed.data;

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
