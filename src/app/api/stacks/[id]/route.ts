import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  requireOwnership,
  authError,
} from '@/lib/auth-guard';

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
      owner: { select: { id: true, name: true, image: true } },
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

  if (!stack) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

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
  if (!stack) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (stack.isCompany) {
    const auth = await requireAdmin();
    if ('error' in auth) return authError(auth);
  } else {
    const auth = await requireOwnership(stack.ownerId);
    if ('error' in auth) return authError(auth);
  }

  const body = await request.json();
  const updated = await prisma.goalStack.update({
    where: { id },
    data: { name: body.name },
  });

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stack = await prisma.goalStack.findUnique({ where: { id } });
  if (!stack) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (stack.isCompany) {
    const auth = await requireAdmin();
    if ('error' in auth) return authError(auth);
  } else {
    const auth = await requireOwnership(stack.ownerId);
    if ('error' in auth) return authError(auth);
  }

  await prisma.goalStack.delete({ where: { id } });
  return Response.json({ ok: true });
}
