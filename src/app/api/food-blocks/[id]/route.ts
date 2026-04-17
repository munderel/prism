import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { notFoundResponse } from '@/lib/api-helpers';

const updateFoodBlockSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const block = await prisma.foodBlock.findUnique({ where: { id } });
  if (!block || block.userId !== auth.userId) return notFoundResponse('FoodBlock');

  const parsed = await parseBody(request, updateFoodBlockSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.foodBlock.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const block = await prisma.foodBlock.findUnique({ where: { id } });
  if (!block || block.userId !== auth.userId) return notFoundResponse('FoodBlock');

  await prisma.foodBlock.delete({ where: { id } });
  return Response.json({ success: true });
}
