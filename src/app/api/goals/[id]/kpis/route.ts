import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackReadAccess, checkStackWriteAccess, verifyStackMembership } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';
import { parseBody, createKpiSchema } from '@/lib/schemas';
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

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = await checkStackReadAccess(
    goal.stack,
    auth.userId,
    auth.session.user.isAdmin,
    { goalId }
  );
  if (accessDenied) return accessDenied;

  const kpis = await prisma.kpi.findMany({
    where: { goalId },
    orderBy: { sortOrder: 'asc' },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Enrich KPIs with linked child actuals (monthly<-weekly, yearly<-monthly, HHG<-yearly)
  const LEVELS_WITH_CHILDREN = ['HIGH_HARD', 'STRATEGIC', 'MONTHLY'];
  if (LEVELS_WITH_CHILDREN.includes(goal.level)) {
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

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  // Creating a KPI is a structural write — admin or stack owner only.
  const accessDenied = await checkStackWriteAccess(
    goal.stack,
    auth.userId,
    auth.session.user.isAdmin
  );
  if (accessDenied) return accessDenied;

  if (!validateKpiLevel(goal.level)) {
    return Response.json(
      { error: `KPIs are not allowed on ${goal.level} goals` },
      { status: 400 }
    );
  }

  const parsed = await parseBody(request, createKpiSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, type, unit, targetValue, linkedKpiId, ownerId } = body;

  if (ownerId) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) {
      return Response.json({ error: 'Owner user not found' }, { status: 400 });
    }
    // The proposed owner must have legitimate visibility into the stack,
    // otherwise they'd see a KPI attached to a goal they can't access.
    const isMember = await verifyStackMembership(goal.stack, ownerId, goalId);
    if (!isMember) {
      return Response.json(
        { error: 'Owner is not a member of this stack or goal' },
        { status: 400 },
      );
    }
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
      ownerId: ownerId ?? null,
      sortOrder: (lastKpi?.sortOrder ?? -1) + 1,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return Response.json(kpi, { status: 201 });
}
