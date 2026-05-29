import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createStackSchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Binary scope model (Issue 11): company stacks (isCompany) are visible to
  // everyone; personal stacks are visible only to their owner. The legacy
  // `visibility` field is no longer consulted here — the normalization
  // migration folds any 'group'/'company' visibility into isCompany=true so a
  // shared stack is always isCompany, and personal stacks never leak.
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

  return Response.json(stacks, NO_STORE);
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, createStackSchema);
  if ('error' in parsed) return parsed.error;
  const { name, isCompany, visibility } = parsed.data;

  // Any shared stack collapses to the single "company" tier (visible to
  // everyone). Only admins can create company stacks; everyone else creates
  // personal (owner-only) stacks.
  const wantsShared = isCompany || visibility === 'company' || visibility === 'group';
  const auth = wantsShared ? await requireAdmin() : await requireAuth();
  if ('error' in auth) return authError(auth);

  const stack = await prisma.goalStack.create({
    data: {
      name,
      isCompany: wantsShared,
      visibility: wantsShared ? 'company' : 'private',
      ownerId: auth.userId,
    },
  });

  return Response.json(stack, { status: 201, ...NO_STORE });
}
