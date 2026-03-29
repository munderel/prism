import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { value, date, notes } = body;

  if (value === undefined || value === null) {
    return Response.json({ error: 'value is required' }, { status: 400 });
  }

  const entry = await prisma.processKpiEntry.create({
    data: {
      kpiId,
      userId: auth.userId,
      value: Number(value),
      date: date ? new Date(date) : new Date(),
      notes: notes || null,
    },
  });

  return Response.json(entry, { status: 201 });
}
