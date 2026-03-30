import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, safeParseJson } from '@/lib/api-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { id: processId, kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Verify process exists and user has access
  const process = await prisma.process.findUnique({
    where: { id: processId },
    select: { id: true, assigneeId: true, delegateId: true },
  });
  if (!process) return notFoundResponse('Process');
  if (!auth.session.user.isAdmin && process.assigneeId !== auth.userId && process.delegateId !== auth.userId) {
    return forbiddenResponse();
  }

  // Verify KPI exists and belongs to this process
  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { value, date, notes } = body;

  if (value === undefined || value === null) {
    return Response.json({ error: 'value is required' }, { status: 400 });
  }

  const numValue = Number(value);
  if (isNaN(numValue) || !isFinite(numValue)) {
    return Response.json({ error: 'value must be a valid number' }, { status: 400 });
  }

  const entry = await prisma.processKpiEntry.create({
    data: {
      kpiId,
      userId: auth.userId,
      value: numValue,
      date: date ? new Date(date) : new Date(),
      notes: notes || null,
    },
  });

  return Response.json(entry, { status: 201 });
}
