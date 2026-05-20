import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).text !== 'string' ||
    !(body as Record<string, unknown>).text
  ) {
    return Response.json({ error: 'text is required and must be a non-empty string' }, { status: 400 });
  }

  const text = ((body as Record<string, unknown>).text as string).trim();
  if (!text) {
    return Response.json({ error: 'text must not be blank' }, { status: 400 });
  }

  // Position = max existing position + 1 (0-indexed, so first item is 0)
  const maxOrder = await prisma.deliverableItem.aggregate({
    where: { taskId },
    _max: { position: true },
  });

  const item = await prisma.deliverableItem.create({
    data: {
      taskId,
      text,
      isDone: false,
      position: (maxOrder._max.position ?? -1) + 1,
    },
  });

  return Response.json(item, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
