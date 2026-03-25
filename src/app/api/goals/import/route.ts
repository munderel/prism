import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

import { parseYamlToGoals, diffGoals, buildGoalTree, type GoalNode } from '@/lib/yaml-handler';
import { cascadeProgressUp } from '@/lib/progress';
import { cascadeKpiUpdate } from '@/lib/kpi-progress';
import { validateGoalLevel } from '@/lib/goal-validation';

const MAX_YAML_SIZE = 256 * 1024; // 256KB

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { stackId, yamlContent, confirmed } = body;

  if (typeof yamlContent !== 'string' || yamlContent.length > MAX_YAML_SIZE) {
    return Response.json(
      { error: 'YAML content must be a string under 256KB' },
      { status: 400 }
    );
  }

  if (!stackId || !yamlContent) {
    return Response.json(
      { error: 'stackId and yamlContent are required' },
      { status: 400 }
    );
  }

  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) {
    return Response.json({ error: 'Stack not found' }, { status: 404 });
  }

  if (stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else if (stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse incoming YAML (spec semantic format)
  let incomingGoals: GoalNode[];
  try {
    const parsed = parseYamlToGoals(yamlContent);
    incomingGoals = parsed.goals;
  } catch {
    return Response.json({ error: 'Invalid YAML' }, { status: 400 });
  }

  // Build current tree from DB
  const currentDbGoals = await prisma.goal.findMany({
    where: { stackId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      kpis: {
        orderBy: { sortOrder: 'asc' },
        include: { linkedKpi: { select: { name: true } } },
      },
    },
  });

  // Annotate KPIs with linked name for diff comparison
  const annotatedGoals = currentDbGoals.map((g: any) => ({
    ...g,
    kpis: g.kpis.map((k: any) => ({
      ...k,
      _linkedKpiName: k.linkedKpi?.name ?? undefined,
    })),
  }));

  const currentTree = buildGoalTree(annotatedGoals);
  const diff = diffGoals(currentTree, incomingGoals);

  // Preview mode: return diff without applying
  if (!confirmed) {
    return Response.json({ diff, preview: true });
  }

  // Commit mode: apply changes
  const now = new Date();

  // Soft-delete removed goals
  for (const del of diff.deleted) {
    await prisma.goal.update({
      where: { id: del.id },
      data: { deletedAt: now },
    });
  }

  // Update modified goals
  for (const mod of diff.modified) {
    const data: Record<string, any> = {};
    for (const [field, change] of Object.entries(mod.changes)) {
      if (field === 'dueDate') {
        data[field] = change.to ? new Date(change.to) : null;
      } else {
        data[field] = change.to;
      }
    }
    await prisma.goal.update({ where: { id: mod.id }, data });
  }

  // Create new goals (walk the incoming tree, create those without IDs)
  // kpiLinkQueue collects weekly KPIs that need to be linked to monthly KPIs after creation
  const kpiLinkQueue: { kpiId: string; parentGoalId: string; linkedToName: string }[] = [];
  await createNewGoals(incomingGoals, stackId, null, null, { count: 0 }, 0, auth.userId, kpiLinkQueue);

  // Resolve KPI links (two-pass: monthly KPIs created first, now link weekly KPIs)
  for (const link of kpiLinkQueue) {
    const monthlyKpi = await prisma.kpi.findFirst({
      where: { goal: { id: link.parentGoalId }, name: link.linkedToName },
    });
    if (monthlyKpi) {
      await prisma.kpi.update({
        where: { id: link.kpiId },
        data: { linkedKpiId: monthlyKpi.id },
      });
    }
  }

  // Recalculate monthly KPIs that have new linked weeklies
  if (kpiLinkQueue.length > 0) {
    const monthlyGoalIds = Array.from(new Set(kpiLinkQueue.map((l) => l.parentGoalId)));
    const monthlyKpis = await prisma.kpi.findMany({
      where: { goalId: { in: monthlyGoalIds }, linkedFrom: { some: {} } },
    });
    await Promise.all(monthlyKpis.map((mk) => cascadeKpiUpdate(mk.id)));
  }

  // Create ConfigVersion
  const maxVersion = await prisma.configVersion.findFirst({
    where: { stackId },
    orderBy: { versionNum: 'desc' },
    select: { versionNum: true },
  });

  await prisma.configVersion.create({
    data: {
      stackId,
      versionNum: (maxVersion?.versionNum ?? 0) + 1,
      yamlContent,
      changeSummary: `${diff.added.length} added, ${diff.deleted.length} deleted, ${diff.modified.length} modified, ${diff.kpiChanges.length} KPI changes`,
      createdById: auth.userId,
    },
  });

  // Cascade progress bottom-up: start from leaf goals so parents recompute correctly
  const leafGoals = await prisma.goal.findMany({
    where: {
      stackId,
      deletedAt: null,
      children: { none: { deletedAt: null } },
    },
    select: { id: true },
  });
  for (const leaf of leafGoals) {
    await cascadeProgressUp(leaf.id);
  }

  return Response.json({ ok: true, diff });
}

const MAX_GOALS_PER_IMPORT = 500;
const MAX_IMPORT_DEPTH = 20;

async function createNewGoals(
  nodes: GoalNode[],
  stackId: string,
  parentId: string | null,
  parentLevel: string | null = null,
  counter = { count: 0 },
  depth = 0,
  ownerId: string | null = null,
  kpiLinkQueue: { kpiId: string; parentGoalId: string; linkedToName: string }[] = []
) {
  if (depth > MAX_IMPORT_DEPTH) {
    throw new Error('Import exceeds maximum nesting depth');
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.id) {
      if (counter.count >= MAX_GOALS_PER_IMPORT) {
        throw new Error(`Import exceeds maximum of ${MAX_GOALS_PER_IMPORT} goals`);
      }

      // Validate level hierarchy
      if (!validateGoalLevel(node.level, parentLevel)) {
        throw new Error(
          `Invalid hierarchy: ${node.level} cannot be a child of ${parentLevel ?? 'root'}`
        );
      }

      // New goal — create it
      const created = await prisma.goal.create({
        data: {
          stackId,
          parentId,
          level: node.level as any,
          title: node.title,
          description: node.description ?? null,
          status: (node.status as any) ?? 'NOT_STARTED',
          dueDate: node.dueDate ? new Date(node.dueDate) : null,
          sortOrder: i,
        },
      });
      counter.count++;

      // Create tasks linked to this goal
      if (node.tasks?.length && ownerId) {
        for (const task of node.tasks) {
          await prisma.task.create({
            data: {
              ownerId,
              goalId: created.id,
              taskType: 'IMPROVE',
              title: task.title,
              description: task.description ?? null,
              status: (task.status as any) ?? 'TODO',
              priority: (task.priority as any) ?? 'MEDIUM',
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              completedAt: task.status === 'DONE' ? new Date() : null,
              estimatedMinutes: 60,
            },
          });
        }
      }

      // Create KPIs for this goal
      if (node.kpis?.length) {
        const kpiLevel = node.level;
        const isMonthlyOrAbove = ['STRATEGIC', 'MONTHLY'].includes(kpiLevel);
        for (let ki = 0; ki < node.kpis.length; ki++) {
          const kpiNode = node.kpis[ki];
          const createdKpi = await prisma.kpi.create({
            data: {
              goalId: created.id,
              name: kpiNode.name,
              type: (kpiNode.type?.toUpperCase() ?? 'NUMERIC') as any,
              unit: kpiNode.unit ?? null,
              targetValue: kpiNode.target ?? null,
              actualValue: kpiNode.actual ?? null,
              isComplete: kpiNode.complete ?? false,
              completedAt: kpiNode.complete ? new Date() : null,
              sortOrder: ki,
            },
          });

          // Queue link resolution for weekly KPIs
          if (kpiNode.linked_to && !isMonthlyOrAbove && parentId) {
            kpiLinkQueue.push({
              kpiId: createdKpi.id,
              parentGoalId: parentId,
              linkedToName: kpiNode.linked_to,
            });
          }
        }
      }

      // Recurse for children of this new goal
      if (node.children?.length) {
        await createNewGoals(node.children, stackId, created.id, node.level, counter, depth + 1, ownerId, kpiLinkQueue);
      }
    } else if (node.children?.length) {
      // Existing goal — recurse into children to find new ones
      await createNewGoals(node.children, stackId, node.id, node.level, counter, depth + 1, ownerId, kpiLinkQueue);
    }
  }
}
