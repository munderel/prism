import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  requireOwnership,
  authError,
} from '@/lib/auth-guard';
import { notFoundResponse, USER_SUMMARY_SELECT, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateStackSchema } from '@/lib/schemas';

/** Authorize write access: admins for company stacks, owners for personal stacks. */
async function requireStackWriteAccess(stack: { isCompany: boolean; ownerId: string }): Promise<Response | null> {
  const auth = stack.isCompany
    ? await requireAdmin()
    : await requireOwnership(stack.ownerId);
  if ('error' in auth) return authError(auth);
  return null;
}

const ACTIVE_GOALS = { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const stack = await prisma.goalStack.findUnique({
    where: { id },
    include: {
      owner: { select: USER_SUMMARY_SELECT },
      goals: {
        ...ACTIVE_GOALS,
        where: { ...ACTIVE_GOALS.where, parentId: null },
        include: {
          children: {
            ...ACTIVE_GOALS,
            include: {
              children: {
                ...ACTIVE_GOALS,
                include: {
                  children: {
                    ...ACTIVE_GOALS,
                    include: { children: ACTIVE_GOALS },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!stack) return notFoundResponse('Stack');

  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json(stack);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stack = await prisma.goalStack.findUnique({ where: { id } });
  if (!stack) return notFoundResponse('Stack');

  const denied = await requireStackWriteAccess(stack);
  if (denied) return denied;

  const parsed = await parseBody(request, updateStackSchema);
  if ('error' in parsed) return parsed.error;
  const data = pickDefined(parsed.data, ['name', 'weekStartDay']);

  const updated = await prisma.goalStack.update({ where: { id }, data });
  return Response.json(updated, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stack = await prisma.goalStack.findUnique({ where: { id } });
  if (!stack) return notFoundResponse('Stack');

  const denied = await requireStackWriteAccess(stack);
  if (denied) return denied;

  await prisma.goalStack.delete({ where: { id } });
  return Response.json({ ok: true }, NO_STORE);
}
