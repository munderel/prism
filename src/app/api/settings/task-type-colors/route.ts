import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const upsertSchema = z.object({
  itemType: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR_RE, 'Must be a hex color (#RGB or #RRGGBB)'),
});

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const rows = await prisma.userTaskTypeColor.findMany({
    where: { userId: auth.userId },
    orderBy: { itemType: 'asc' },
  });
  return Response.json({ overrides: rows });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, upsertSchema);
  if ('error' in parsed) return parsed.error;
  const { itemType, color } = parsed.data;

  const row = await prisma.userTaskTypeColor.upsert({
    where: { userId_itemType: { userId: auth.userId, itemType } },
    create: { userId: auth.userId, itemType, color },
    update: { color },
  });
  return Response.json(row);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const itemType = request.nextUrl.searchParams.get('itemType');
  if (!itemType) {
    return Response.json({ error: 'itemType query param is required' }, { status: 400 });
  }
  await prisma.userTaskTypeColor.deleteMany({
    where: { userId: auth.userId, itemType },
  });
  return Response.json({ ok: true });
}
