import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { authorizeProcessAccess, notFoundResponse } from '@/lib/api-helpers';
import { parseBody, createKpiEntrySchema } from '@/lib/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { id: processId, kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(processId, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  const parsed = await parseBody(request, createKpiEntrySchema);
  if ('error' in parsed) return parsed.error;
  const { value, date, notes } = parsed.data;

  const entry = await prisma.processKpiEntry.create({
    data: {
      kpiId,
      userId: auth.userId,
      value,
      date: date ? new Date(date) : new Date(),
      notes: notes || null,
    },
  });

  return Response.json(entry, { status: 201 });
}
