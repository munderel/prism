import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson, notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';

import { parseYamlToGoals, diffGoals, buildGoalTree, type GoalNode, type KpiNode } from '@/lib/yaml-handler';
import { cascadeProgressUp } from '@/lib/progress';
import { cascadeKpiUpdate } from '@/lib/kpi-progress';
import { validateGoalLevel } from '@/lib/goal-validation';

const MAX_YAML_SIZE = 256 * 1024; // 256KB

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { stackId, yamlContent, confirmed } = body;

  if (!stackId || !yamlContent) {
    return Response.json(
      { error: 'stackId and yamlContent are required' },
      { status: 400 }
    );
  }

  if (typeof yamlContent !== 'string' || yamlContent.length > MAX_YAML_SIZE) {
    return Response.json(
      { error: 'YAML content must be a string under 256KB' },
      { status: 400 }
    );
  }

  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) return notFoundResponse('Stack');

  if (stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else if (stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return forbiddenResponse();
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
  const GOAL_DATE_FIELDS = new Set(['dueDate', 'startDate', 'endDate']);
  for (const mod of diff.modified) {
    const data: Record<string, any> = {};
    for (const [field, change] of Object.entries(mod.changes)) {
      if (GOAL_DATE_FIELDS.has(field)) {
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

  // Task updates on existing goals (add/modify/remove based on taskChanges)
  const TASK_DATE_FIELDS = new Set(['dueDate', 'timeBlockStart', 'timeBlockEnd']);
  for (const entry of diff.taskChanges) {
    if (!entry.goalId) continue;

    // Added tasks on existing goals
    for (const task of entry.added) {
      await prisma.task.create({
        data: {
          ownerId: auth.userId,
          goalId: entry.goalId,
          taskType: 'IMPROVE',
          title: task.title,
          description: task.description ?? null,
          deliverable: task.deliverable ?? null,
          status: (task.status as any) ?? 'TODO',
          priority: (task.priority as any) ?? 'MEDIUM',
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          completedAt: task.status === 'DONE' ? new Date() : null,
          estimatedMinutes: task.estimatedMinutes ?? 60,
          timeBlockStart: task.timeBlockStart ? new Date(task.timeBlockStart) : null,
          timeBlockEnd: task.timeBlockEnd ? new Date(task.timeBlockEnd) : null,
          recurrenceRule: task.recurrenceRule ?? null,
          isWinTheDay: task.isWinTheDay ?? false,
          preferredTimeStart: task.preferredTimeStart ?? null,
          preferredTimeEnd: task.preferredTimeEnd ?? null,
        },
      });
    }

    // Modified tasks: resolve by id-first, then (goalId, title)
    for (const mod of entry.modified) {
      let existing = null;
      if (mod.id) {
        existing = await prisma.task.findUnique({ where: { id: mod.id } });
      }
      if (!existing) {
        existing = await prisma.task.findFirst({
          where: { goalId: entry.goalId, title: mod.title },
        });
      }
      if (!existing) continue;

      const data: Record<string, any> = {};
      for (const [field, change] of Object.entries(mod.changes)) {
        if (TASK_DATE_FIELDS.has(field)) {
          data[field] = change.to ? new Date(change.to) : null;
        } else {
          data[field] = change.to;
        }
      }
      // If the task was just marked DONE and no completedAt exists yet, set it
      if (data.status === 'DONE' && !existing.completedAt) {
        data.completedAt = new Date();
      }
      await prisma.task.update({ where: { id: existing.id }, data });
    }

    // Removed tasks: mark DROPPED (reversible, consistent with export-keeps-DROPPED policy)
    for (const rem of entry.removed) {
      let existing = null;
      if (rem.id) {
        existing = await prisma.task.findUnique({ where: { id: rem.id } });
      }
      if (!existing) {
        existing = await prisma.task.findFirst({
          where: { goalId: entry.goalId, title: rem.title },
        });
      }
      if (!existing) continue;
      if (existing.status !== 'DROPPED') {
        await prisma.task.update({
          where: { id: existing.id },
          data: { status: 'DROPPED' },
        });
      }
    }
  }

  // KPI updates on existing goals (add/modify/remove based on kpiChanges)
  const goalMeta = new Map(currentDbGoals.map((g) => [g.id, { level: g.level, parentId: g.parentId }]));
  const touchedMonthlyKpiIds = new Set<string>();
  for (const entry of diff.kpiChanges) {
    if (!entry.goalId) continue;

    const goal = goalMeta.get(entry.goalId);
    if (!goal) continue;
    const isParentLevel = ['STRATEGIC', 'MONTHLY'].includes(goal.level);

    // Added KPIs on existing goals — re-parse the incoming yaml tree for this goal's kpis
    // to get full KpiNode objects (kpiChanges.added only has name/type).
    // Walk incomingGoals to find the node matching entry.goalId.
    const incomingKpiByName = collectIncomingKpisForGoal(incomingGoals, entry.goalId);

    for (const added of entry.added) {
      const kpiNode = incomingKpiByName.get(added.name);
      if (!kpiNode) continue;
      const explicitCompletedAt = kpiNode.completed_at ? new Date(kpiNode.completed_at) : null;
      const createdKpi = await prisma.kpi.create({
        data: {
          goalId: entry.goalId,
          name: kpiNode.name,
          type: (kpiNode.type?.toUpperCase() ?? 'NUMERIC') as any,
          unit: kpiNode.unit ?? null,
          targetValue: kpiNode.target ?? null,
          actualValue: kpiNode.actual ?? null,
          isComplete: kpiNode.complete ?? false,
          completedAt: explicitCompletedAt ?? (kpiNode.complete ? new Date() : null),
          sortOrder: 0,
        },
      });

      // Resolve linked_to for weekly-level KPIs
      if (kpiNode.linked_to && !isParentLevel && goal.parentId) {
        const parentKpi = await prisma.kpi.findFirst({
          where: { goalId: goal.parentId, name: kpiNode.linked_to },
        });
        if (parentKpi) {
          await prisma.kpi.update({
            where: { id: createdKpi.id },
            data: { linkedKpiId: parentKpi.id },
          });
          touchedMonthlyKpiIds.add(parentKpi.id);
        }
      }
    }

    // Modified KPIs
    for (const mod of entry.modified) {
      let existing = null;
      if (mod.id) {
        existing = await prisma.kpi.findUnique({ where: { id: mod.id } });
      }
      if (!existing) {
        existing = await prisma.kpi.findFirst({
          where: { goalId: entry.goalId, name: mod.name },
        });
      }
      if (!existing) continue;

      const data: Record<string, any> = {};
      for (const [field, change] of Object.entries(mod.changes)) {
        if (field === 'type') {
          data.type = typeof change.to === 'string' ? change.to.toUpperCase() : change.to;
        } else if (field === 'target') {
          data.targetValue = change.to;
        } else if (field === 'actual') {
          data.actualValue = change.to;
        } else if (field === 'complete') {
          data.isComplete = change.to;
          if (change.to && !existing.completedAt) {
            data.completedAt = new Date();
          } else if (!change.to) {
            data.completedAt = null;
          }
        } else if (field === 'completed_at') {
          data.completedAt = change.to ? new Date(change.to) : null;
        } else if (field === 'linked_to') {
          // Resolve linked_to by name: look up parent KPI on the parent goal
          if (change.to && goal.parentId) {
            const parentKpi = await prisma.kpi.findFirst({
              where: { goalId: goal.parentId, name: change.to as string },
            });
            data.linkedKpiId = parentKpi?.id ?? null;
            if (parentKpi) touchedMonthlyKpiIds.add(parentKpi.id);
          } else {
            data.linkedKpiId = null;
          }
        } else if (field === 'name') {
          data.name = change.to;
        } else if (field === 'unit') {
          data.unit = change.to;
        }
      }
      await prisma.kpi.update({ where: { id: existing.id }, data });

      // If this KPI feeds a monthly aggregate, mark the monthly for recascade
      if (existing.linkedKpiId) touchedMonthlyKpiIds.add(existing.linkedKpiId);
    }

    // Removed KPIs: detach children (self-relation has no onDelete), then delete
    for (const rem of entry.removed) {
      let existing = null;
      if (rem.id) {
        existing = await prisma.kpi.findUnique({ where: { id: rem.id } });
      }
      if (!existing) {
        existing = await prisma.kpi.findFirst({
          where: { goalId: entry.goalId, name: rem.name },
        });
      }
      if (!existing) continue;
      if (existing.linkedKpiId) touchedMonthlyKpiIds.add(existing.linkedKpiId);
      // Detach any children that link to this KPI
      await prisma.kpi.updateMany({
        where: { linkedKpiId: existing.id },
        data: { linkedKpiId: null },
      });
      await prisma.kpi.delete({ where: { id: existing.id } });
    }
  }

  // Recalculate any monthly KPIs affected by KPI updates
  await Promise.all(Array.from(touchedMonthlyKpiIds).map((mkId) => cascadeKpiUpdate(mkId)));

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
      changeSummary: `${diff.added.length} added, ${diff.deleted.length} deleted, ${diff.modified.length} modified, ${diff.kpiChanges.length} KPI changes, ${diff.taskChanges.length} task changes`,
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
  await Promise.all(leafGoals.map((leaf) => cascadeProgressUp(leaf.id)));

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
          startDate: node.startDate ? new Date(node.startDate) : null,
          endDate: node.endDate ? new Date(node.endDate) : null,
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
              deliverable: task.deliverable ?? null,
              status: (task.status as any) ?? 'TODO',
              priority: (task.priority as any) ?? 'MEDIUM',
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              completedAt: task.status === 'DONE' ? new Date() : null,
              estimatedMinutes: task.estimatedMinutes ?? 60,
              timeBlockStart: task.timeBlockStart ? new Date(task.timeBlockStart) : null,
              timeBlockEnd: task.timeBlockEnd ? new Date(task.timeBlockEnd) : null,
              recurrenceRule: task.recurrenceRule ?? null,
              isWinTheDay: task.isWinTheDay ?? false,
              preferredTimeStart: task.preferredTimeStart ?? null,
              preferredTimeEnd: task.preferredTimeEnd ?? null,
            },
          });
        }
      }

      // Create KPIs for this goal
      if (node.kpis?.length) {
        const isParentLevel = ['STRATEGIC', 'MONTHLY'].includes(node.level);
        for (let ki = 0; ki < node.kpis.length; ki++) {
          const kpiNode = node.kpis[ki];
          const explicitCompletedAt = kpiNode.completed_at ? new Date(kpiNode.completed_at) : null;
          const createdKpi = await prisma.kpi.create({
            data: {
              goalId: created.id,
              name: kpiNode.name,
              type: (kpiNode.type?.toUpperCase() ?? 'NUMERIC') as any,
              unit: kpiNode.unit ?? null,
              targetValue: kpiNode.target ?? null,
              actualValue: kpiNode.actual ?? null,
              isComplete: kpiNode.complete ?? false,
              completedAt: explicitCompletedAt ?? (kpiNode.complete ? new Date() : null),
              sortOrder: ki,
            },
          });

          // Queue link resolution for weekly KPIs
          if (kpiNode.linked_to && !isParentLevel && parentId) {
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

/**
 * Walk an incoming goal tree to find a goal by id and return a map of its KPIs keyed by name.
 * Used to look up full KpiNode data for added KPIs on existing goals (where the diff only carries
 * {name, type}).
 */
function collectIncomingKpisForGoal(nodes: GoalNode[], goalId: string): Map<string, KpiNode> {
  const result = new Map<string, KpiNode>();
  const stack: GoalNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === goalId) {
      if (node.kpis) {
        for (const k of node.kpis) result.set(k.name, k);
      }
      return result;
    }
    if (node.children) stack.push(...node.children);
  }
  return result;
}
