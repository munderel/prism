import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { validateKpiLevel, validateKpiLink } from '@/lib/goal-validation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: goalId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { stack: true },
  });

  if (!goal || goal.deletedAt) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!goal.stack.isCompany && goal.stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const kpis = await prisma.kpi.findMany({
    where: { goalId },
    orderBy: { sortOrder: 'asc' },
  });

  // Enrich KPIs with linked child actuals (monthly←weekly, yearly←monthly, HHG←yearly)
  const levelsWithChildren = ['HIGH_HARD', 'STRATEGIC', 'MONTHLY'];
  if (levelsWithChildren.includes(goal.level)) {
    const kpiIds = kpis.map((k) => k.id);
    const allLinkedChildren = await prisma.kpi.findMany({
      where: { linkedKpiId: { in: kpiIds } },
      include: {
        goal: { select: { title: true, sortOrder: true, dueDate: true } },
      },
      orderBy: { goal: { sortOrder: 'asc' } },
    });

    const childrenByParent = new Map<string, typeof allLinkedChildren>();
    for (const child of allLinkedChildren) {
      const key = child.linkedKpiId!;
      const list = childrenByParent.get(key) ?? [];
      list.push(child);
      childrenByParent.set(key, list);
    }

    const enriched = kpis.map((kpi) => {
      const linkedChildren = childrenByParent.get(kpi.id) ?? [];
      const linkedWeeklyActuals = linkedChildren.map((child, idx) => ({
        weekLabel: `W${idx + 1}`,
        actual: child.type === 'NUMERIC' ? child.actualValue : null,
        isComplete: child.isComplete,
        goalTitle: child.goal.title,
      }));
      return { ...kpi, linkedWeeklyActuals };
    });

    return Response.json({ kpis: enriched });
  }

  return Response.json({ kpis });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: goalId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { stack: true },
  });

  if (!goal || goal.deletedAt) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!goal.stack.isCompany && goal.stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!validateKpiLevel(goal.level)) {
    return Response.json(
      { error: `KPIs are not allowed on ${goal.level} goals` },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { name, type, unit, targetValue, linkedKpiId } = body;

  if (!name || !type) {
    return Response.json({ error: 'name and type are required' }, { status: 400 });
  }

  if (type !== 'NUMERIC' && type !== 'BINARY') {
    return Response.json({ error: 'type must be NUMERIC or BINARY' }, { status: 400 });
  }

  // Check unique constraint before create for friendly error
  const existing = await prisma.kpi.findUnique({
    where: { goalId_name: { goalId, name } },
  });
  if (existing) {
    return Response.json(
      { error: `A KPI named "${name}" already exists on this goal` },
      { status: 409 }
    );
  }

  // Validate link if provided
  if (linkedKpiId) {
    const linkedKpi = await prisma.kpi.findUnique({
      where: { id: linkedKpiId },
      include: { goal: { select: { id: true, level: true } } },
    });

    if (!linkedKpi) {
      return Response.json({ error: 'Linked KPI not found' }, { status: 400 });
    }

    if (!validateKpiLink(goal.level, goal.parentId, linkedKpi.goal.id, linkedKpi.goal.level, type, linkedKpi.type)) {
      return Response.json(
        { error: 'Invalid link: KPI must link to a parent-level KPI on its parent goal with matching type' },
        { status: 400 }
      );
    }
  }

  // Get next sortOrder
  const lastKpi = await prisma.kpi.findFirst({
    where: { goalId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const kpi = await prisma.kpi.create({
    data: {
      goalId,
      name,
      type,
      unit: type === 'NUMERIC' ? (unit ?? null) : null,
      targetValue: type === 'NUMERIC' ? (targetValue ?? null) : null,
      linkedKpiId: linkedKpiId ?? null,
      sortOrder: (lastKpi?.sortOrder ?? -1) + 1,
    },
  });

  return Response.json(kpi, { status: 201 });
}
