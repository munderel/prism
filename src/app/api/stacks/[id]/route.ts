import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  requireOwnership,
  authError,
} from '@/lib/auth-guard';
import { notFoundResponse, USER_SUMMARY_SELECT, safeParseJson } from '@/lib/api-helpers';

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
        where: { deletedAt: null, parentId: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              children: {
                where: { deletedAt: null },
                orderBy: { sortOrder: 'asc' },
                include: {
                  children: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: 'asc' },
                    include: {
                      children: {
                        where: { deletedAt: null },
                        orderBy: { sortOrder: 'asc' },
                      },
                    },
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

  // Non-admins can only see own stacks and company stacks
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

  if (stack.isCompany) {
    const auth = await requireAdmin();
    if ('error' in auth) return authError(auth);
  } else {
    const auth = await requireOwnership(stack.ownerId);
    if ('error' in auth) return authError(auth);
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.weekStartDay !== undefined) data.weekStartDay = body.weekStartDay;

  const updated = await prisma.goalStack.update({
    where: { id },
    data,
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stack = await prisma.goalStack.findUnique({ where: { id } });
  if (!stack) return notFoundResponse('Stack');

  if (stack.isCompany) {
    const auth = await requireAdmin();
    if ('error' in auth) return authError(auth);
  } else {
    const auth = await requireOwnership(stack.ownerId);
    if ('error' in auth) return authError(auth);
  }

  await prisma.goalStack.delete({ where: { id } });
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
