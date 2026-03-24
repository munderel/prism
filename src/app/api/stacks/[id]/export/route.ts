import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { exportGoalsToYaml, buildGoalTree, type YamlMeta } from '@/lib/yaml-handler';

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
      owner: { select: { email: true, mtp: true } },
    },
  });

  if (!stack) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all goals as flat list, then build tree using shared utility
  const goals = await prisma.goal.findMany({
    where: { stackId: id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      kpis: {
        orderBy: { sortOrder: 'asc' },
        include: { linkedKpi: { select: { name: true } } },
      },
    },
  });

  // Annotate KPIs with linked KPI name for YAML export
  const annotatedGoals = goals.map((g: any) => ({
    ...g,
    kpis: g.kpis.map((k: any) => ({
      ...k,
      _linkedKpiName: k.linkedKpi?.name ?? undefined,
    })),
  }));

  const tree = buildGoalTree(annotatedGoals);

  // Build meta section per spec
  const meta: YamlMeta = {
    name: stack.name,
    owner: stack.owner?.email ?? '',
    is_company: stack.isCompany,
    exported_at: new Date().toISOString(),
    mtp: stack.owner?.mtp ?? undefined,
  };

  // Include goal links for company stacks
  if (stack.isCompany) {
    const links = await prisma.goalLink.findMany({
      where: { companyGoal: { stackId: id, deletedAt: null } },
      include: {
        companyGoal: { select: { title: true } },
        individualGoal: {
          include: {
            stack: { include: { owner: { select: { email: true } } } },
          },
        },
      },
    });

    // Group links by company goal
    const linkMap = new Map<string, { user: string; goal: string }[]>();
    for (const link of links) {
      const key = link.companyGoal.title;
      if (!linkMap.has(key)) linkMap.set(key, []);
      linkMap.get(key)!.push({
        user: link.individualGoal.stack?.owner?.email ?? '',
        goal: link.individualGoal.title,
      });
    }

    meta.links = Array.from(linkMap.entries()).map(([companyGoal, individualGoals]) => ({
      company_goal: companyGoal,
      individual_goals: individualGoals,
    }));
  }

  const yamlStr = exportGoalsToYaml(tree, meta);

  return new Response(yamlStr, {
    status: 200,
    headers: {
      'Content-Type': 'text/yaml',
      'Content-Disposition': `attachment; filename="${stack.name}.yaml"`,
    },
  });
}
