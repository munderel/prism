import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';
import { parseBody, importGoalsSchema } from '@/lib/schemas';

import {
  parseYamlToGoals,
  diffGoals,
  buildGoalTree,
  type GoalNode,
  type KpiNode,
  type TaskNode,
  type YamlMeta,
} from '@/lib/yaml-handler';
import { cascadeProgressUp } from '@/lib/progress';
import { cascadeKpiUpdate } from '@/lib/kpi-progress';
import { validateGoalLevel } from '@/lib/goal-validation';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsedBody = await parseBody(request, importGoalsSchema);
  if ('error' in parsedBody) return parsedBody.error;
  const body = parsedBody.data;
  const { stackId, yamlContent, confirmed } = body;

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
  let incomingMeta: YamlMeta;
  try {
    const parsed = parseYamlToGoals(yamlContent);
    incomingGoals = parsed.goals;
    incomingMeta = parsed.meta;
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
        include: {
          linkedKpi: { select: { name: true } },
          owner: { select: { email: true } },
        },
      },
      tasks: {
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        include: { assignee: { select: { email: true } } },
      },
      assignees: { include: { user: { select: { email: true } } } },
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

  // Build current meta for diff comparison (subset of fields we round-trip)
  const currentMeta: Partial<YamlMeta> = {
    visibility: stack.visibility,
    week_start_day: stack.weekStartDay,
  };
  if (stack.isCompany) {
    const currentLinks = await prisma.goalLink.findMany({
      where: { companyGoal: { stackId, deletedAt: null } },
      include: {
        companyGoal: { select: { title: true } },
        individualGoal: {
          include: { stack: { include: { owner: { select: { email: true } } } } },
        },
      },
    });
    const linkMap = new Map<string, { user: string; goal: string }[]>();
    for (const link of currentLinks) {
      const k = link.companyGoal.title;
      if (!linkMap.has(k)) linkMap.set(k, []);
      linkMap.get(k)!.push({
        user: link.individualGoal.stack?.owner?.email ?? '',
        goal: link.individualGoal.title,
      });
    }
    currentMeta.links = Array.from(linkMap.entries()).map(([company_goal, individual_goals]) => ({
      company_goal,
      individual_goals,
    }));

    const currentAssignments = await prisma.companyGoalAssignment.findMany({
      where: { goalStackId: stackId },
      include: { user: { select: { email: true } } },
    });
    currentMeta.company_assignments = currentAssignments.map((a) => ({
      user: a.user.email,
      notes: a.notes ?? undefined,
    }));
  }

  const diff = diffGoals(currentTree, incomingGoals, currentMeta, incomingMeta);

  // Preview mode: return diff without applying
  if (!confirmed) {
    return Response.json({ diff, preview: true, warnings: [] });
  }

  // -----------------------------------------------------------------------
  // Commit mode
  // -----------------------------------------------------------------------
  const now = new Date();
  const warnings: string[] = [];
  const warn = (msg: string) => {
    warnings.push(msg);
  };

  // Cache user-by-email lookups within this request to keep query count down.
  const userByEmailCache = new Map<string, string | null>();
  async function resolveUserId(email: string | undefined | null): Promise<string | null> {
    if (!email) return null;
    if (userByEmailCache.has(email)) return userByEmailCache.get(email) ?? null;
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const id = u?.id ?? null;
    userByEmailCache.set(email, id);
    return id;
  }

  // Soft-delete removed goals
  for (const del of diff.deleted) {
    await prisma.goal.update({
      where: { id: del.id },
      data: { deletedAt: now },
    });
  }

  // Update modified goals
  // Skip keys that need special handling (assignees, sortOrder is fine as a normal field).
  const GOAL_DATE_FIELDS = new Set(['dueDate', 'startDate', 'endDate']);
  const GOAL_SPECIAL_FIELDS = new Set(['assignees_added', 'assignees_removed']);
  for (const mod of diff.modified) {
    const data: Record<string, any> = {};
    for (const [field, change] of Object.entries(mod.changes)) {
      if (GOAL_SPECIAL_FIELDS.has(field)) continue;
      if (GOAL_DATE_FIELDS.has(field)) {
        data[field] = change.to ? new Date(change.to as string) : null;
      } else {
        data[field] = change.to;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.goal.update({ where: { id: mod.id }, data });
    }

    // Apply goal assignees diff: resolve emails → User.id, upsert/remove.
    const addedAssignees = (mod.changes.assignees_added?.to as string[] | undefined) ?? [];
    for (const email of addedAssignees) {
      const userId = await resolveUserId(email);
      if (!userId) {
        warn(`Unknown assignee email "${email}" on goal "${mod.title}"`);
        continue;
      }
      await prisma.goalAssignee.upsert({
        where: { goalId_userId: { goalId: mod.id, userId } },
        create: { goalId: mod.id, userId },
        update: {},
      });
    }
    const removedAssignees = (mod.changes.assignees_removed?.from as string[] | undefined) ?? [];
    for (const email of removedAssignees) {
      const userId = await resolveUserId(email);
      if (!userId) continue;
      await prisma.goalAssignee.deleteMany({ where: { goalId: mod.id, userId } });
    }
  }

  // Goal sortOrder reorder pass: if YAML changed the position of an existing
  // goal within its parent, update sortOrder. We compute the incoming index
  // by walking the YAML tree per-parent and set sortOrder = index for any
  // existing goal whose value drifted. Independent rows — serial updates OK.
  const incomingSortIndex = new Map<string, number>();
  function walk(nodes: GoalNode[]) {
    nodes.forEach((node, idx) => {
      if (node.id) incomingSortIndex.set(node.id, idx);
      if (node.children) walk(node.children);
    });
  }
  walk(incomingGoals);
  const currentSortOrderById = new Map(currentDbGoals.map((g) => [g.id, g.sortOrder ?? 0]));
  const reorderUpdates: { id: string; idx: number }[] = [];
  incomingSortIndex.forEach((idx, id) => {
    if (currentSortOrderById.has(id) && currentSortOrderById.get(id) !== idx) {
      reorderUpdates.push({ id, idx });
    }
  });
  for (const { id, idx } of reorderUpdates) {
    await prisma.goal.update({ where: { id }, data: { sortOrder: idx } });
  }

  // Create new goals (walk the incoming tree, create those without IDs)
  // kpiLinkQueue collects weekly KPIs that need to be linked to monthly KPIs after creation
  const kpiLinkQueue: { kpiId: string; parentGoalId: string; linkedToName: string }[] = [];
  await createNewGoals(
    incomingGoals,
    stackId,
    null,
    null,
    { count: 0 },
    0,
    auth.userId,
    kpiLinkQueue,
    resolveUserId,
    warn
  );

  // Resolve KPI links (two-pass: monthly KPIs created first, now link weekly KPIs)
  if (kpiLinkQueue.length > 0) {
    const parentIds = Array.from(new Set(kpiLinkQueue.map((l) => l.parentGoalId)));
    const allMonthlyKpis = await prisma.kpi.findMany({
      where: { goalId: { in: parentIds } },
    });
    const kpiMap = new Map(allMonthlyKpis.map((k) => [`${k.goalId}:${k.name}`, k]));
    const updates = kpiLinkQueue
      .map((link) => {
        const mk = kpiMap.get(`${link.parentGoalId}:${link.linkedToName}`);
        return mk ? prisma.kpi.update({ where: { id: link.kpiId }, data: { linkedKpiId: mk.id } }) : null;
      })
      .filter(Boolean);
    await Promise.all(updates);
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
  const TASK_DATE_FIELDS = new Set([
    'dueDate',
    'timeBlockStart',
    'timeBlockEnd',
    'startedAt',
    'completedAt',
    'failedAt',
    'rescheduledTo',
  ]);
  for (const entry of diff.taskChanges) {
    if (!entry.goalId) continue;

    // Added tasks on existing goals
    for (const task of entry.added) {
      await prisma.task.create({
        data: await buildTaskCreateData(task, entry.goalId, auth.userId, resolveUserId, warn),
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
        if (field === 'assignee') {
          if (change.to) {
            const uid = await resolveUserId(change.to as string);
            if (!uid) warn(`Unknown task assignee "${change.to}" on task "${mod.title}"`);
            data.assigneeId = uid;
          } else {
            data.assigneeId = null;
          }
        } else if (field === 'parentId') {
          if (change.to) {
            const exists = await prisma.task.findUnique({ where: { id: change.to as string }, select: { id: true } });
            if (!exists) {
              warn(`Stale parent_task_id "${change.to}" on task "${mod.title}"`);
              data.parentId = null;
            } else {
              data.parentId = change.to;
            }
          } else {
            data.parentId = null;
          }
        } else if (field === 'processId') {
          if (change.to) {
            const exists = await prisma.process.findUnique({ where: { id: change.to as string }, select: { id: true } });
            if (!exists) {
              warn(`Stale process_id "${change.to}" on task "${mod.title}"`);
              data.processId = null;
            } else {
              data.processId = change.to;
            }
          } else {
            data.processId = null;
          }
        } else if (field === 'aimInstanceId') {
          if (change.to) {
            const exists = await prisma.aimInstance.findUnique({ where: { id: change.to as string }, select: { id: true } });
            if (!exists) {
              warn(`Stale aim_instance_id "${change.to}" on task "${mod.title}"`);
              data.aimInstanceId = null;
            } else {
              data.aimInstanceId = change.to;
            }
          } else {
            data.aimInstanceId = null;
          }
        } else if (TASK_DATE_FIELDS.has(field)) {
          data[field] = change.to ? new Date(change.to as string) : null;
        } else {
          data[field] = change.to;
        }
      }
      // If the task was just marked DONE and no completedAt exists yet, set it
      if (data.status === 'DONE' && !existing.completedAt && data.completedAt === undefined) {
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
    const incomingKpiByName = collectIncomingKpisForGoal(incomingGoals, entry.goalId);

    // Pre-compute the next sortOrder for any KPI that doesn't specify one.
    const existingKpis = await prisma.kpi.findMany({
      where: { goalId: entry.goalId },
      select: { sortOrder: true },
    });
    let nextSortOrder = existingKpis.reduce((max, k) => Math.max(max, k.sortOrder ?? 0), -1) + 1;
    const usedSortOrders = new Set(existingKpis.map((k) => k.sortOrder ?? 0));

    for (const added of entry.added) {
      const kpiNode = incomingKpiByName.get(added.name);
      if (!kpiNode) continue;
      const explicitCompletedAt = kpiNode.completed_at ? new Date(kpiNode.completed_at) : null;
      let sortOrder = kpiNode.sortOrder;
      if (sortOrder == null || usedSortOrders.has(sortOrder)) {
        sortOrder = nextSortOrder++;
      }
      usedSortOrders.add(sortOrder);
      const ownerId = kpiNode.owner ? await resolveUserId(kpiNode.owner) : null;
      if (kpiNode.owner && !ownerId) {
        warn(`Unknown KPI owner email "${kpiNode.owner}" on KPI "${kpiNode.name}"`);
      }
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
          sortOrder,
          ownerId,
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
          data.completedAt = change.to ? new Date(change.to as string) : null;
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
        } else if (field === 'owner') {
          if (change.to) {
            const uid = await resolveUserId(change.to as string);
            if (!uid) warn(`Unknown KPI owner email "${change.to}" on KPI "${mod.name}"`);
            data.ownerId = uid;
          } else {
            data.ownerId = null;
          }
        } else if (field === 'name') {
          data.name = change.to;
        } else if (field === 'unit') {
          data.unit = change.to;
        } else if (field === 'sortOrder') {
          data.sortOrder = change.to;
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

  // Stack-level metadata: visibility / weekStartDay
  const stackUpdate: Record<string, any> = {};
  if (incomingMeta.visibility !== undefined && incomingMeta.visibility !== stack.visibility) {
    stackUpdate.visibility = incomingMeta.visibility;
  }
  if (
    incomingMeta.week_start_day !== undefined &&
    incomingMeta.week_start_day !== stack.weekStartDay
  ) {
    stackUpdate.weekStartDay = incomingMeta.week_start_day;
  }
  if (Object.keys(stackUpdate).length > 0) {
    await prisma.goalStack.update({ where: { id: stackId }, data: stackUpdate });
  }

  // meta.links and meta.company_assignments — only for company stacks.
  // GoalLink resolution assumes goal titles are unique within a stack; on
  // collision we warn and take the first match.
  if (stack.isCompany) {
    await applyMetaLinks(stackId, incomingMeta.links ?? [], warn);
    await applyCompanyAssignments(stackId, incomingMeta.company_assignments ?? [], auth.userId, resolveUserId, warn);
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

  return Response.json({ ok: true, diff, warnings });
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
  kpiLinkQueue: { kpiId: string; parentGoalId: string; linkedToName: string }[] = [],
  resolveUserId: (email: string | undefined | null) => Promise<string | null> = async () => null,
  warn: (msg: string) => void = () => {}
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
          sortOrder: node.sortOrder ?? i,
        },
      });
      counter.count++;

      // Goal assignees on new goals
      if (node.assignees?.length) {
        for (const email of node.assignees) {
          const userId = await resolveUserId(email);
          if (!userId) {
            warn(`Unknown assignee email "${email}" on new goal "${node.title}"`);
            continue;
          }
          await prisma.goalAssignee.upsert({
            where: { goalId_userId: { goalId: created.id, userId } },
            create: { goalId: created.id, userId },
            update: {},
          });
        }
      }

      // Validate: tasks can only exist under WEEKLY goals
      if (node.level !== 'WEEKLY' && node.tasks?.length) {
        throw new Error(
          `Tasks can only exist under WEEKLY goals. Found tasks under ${node.level} goal: '${node.title}'`
        );
      }

      // Create tasks linked to this goal
      if (node.tasks?.length && ownerId) {
        for (const task of node.tasks) {
          await prisma.task.create({
            data: await buildTaskCreateData(task, created.id, ownerId, resolveUserId, warn),
          });
        }
      }

      // Create KPIs for this goal
      if (node.kpis?.length) {
        const isParentLevel = ['STRATEGIC', 'MONTHLY'].includes(node.level);
        for (let ki = 0; ki < node.kpis.length; ki++) {
          const kpiNode = node.kpis[ki];
          const explicitCompletedAt = kpiNode.completed_at ? new Date(kpiNode.completed_at) : null;
          const kpiOwnerId = kpiNode.owner ? await resolveUserId(kpiNode.owner) : null;
          if (kpiNode.owner && !kpiOwnerId) {
            warn(`Unknown KPI owner email "${kpiNode.owner}" on KPI "${kpiNode.name}"`);
          }
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
              sortOrder: kpiNode.sortOrder ?? ki,
              ownerId: kpiOwnerId,
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
        await createNewGoals(
          node.children,
          stackId,
          created.id,
          node.level,
          counter,
          depth + 1,
          ownerId,
          kpiLinkQueue,
          resolveUserId,
          warn
        );
      }
    } else if (node.children?.length) {
      // Existing goal — recurse into children to find new ones
      await createNewGoals(
        node.children,
        stackId,
        node.id,
        node.level,
        counter,
        depth + 1,
        ownerId,
        kpiLinkQueue,
        resolveUserId,
        warn
      );
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

/**
 * Build the prisma.task.create `data` payload from a TaskNode, resolving
 * cross-references (assignee email, parent/process/aim opaque ids) and
 * warning on stale references rather than aborting.
 */
async function buildTaskCreateData(
  task: TaskNode,
  goalId: string,
  ownerId: string,
  resolveUserId: (email: string | undefined | null) => Promise<string | null>,
  warn: (msg: string) => void
): Promise<any> {
  const assigneeId = task.assignee ? await resolveUserId(task.assignee) : null;
  if (task.assignee && !assigneeId) {
    warn(`Unknown task assignee "${task.assignee}" on task "${task.title}"`);
  }

  let parentId: string | null = null;
  if (task.parentId) {
    const exists = await prisma.task.findUnique({ where: { id: task.parentId }, select: { id: true } });
    if (!exists) warn(`Stale parent_task_id "${task.parentId}" on task "${task.title}"`);
    else parentId = task.parentId;
  }
  let processId: string | null = null;
  if (task.processId) {
    const exists = await prisma.process.findUnique({ where: { id: task.processId }, select: { id: true } });
    if (!exists) warn(`Stale process_id "${task.processId}" on task "${task.title}"`);
    else processId = task.processId;
  }
  let aimInstanceId: string | null = null;
  if (task.aimInstanceId) {
    const exists = await prisma.aimInstance.findUnique({ where: { id: task.aimInstanceId }, select: { id: true } });
    if (!exists) warn(`Stale aim_instance_id "${task.aimInstanceId}" on task "${task.title}"`);
    else aimInstanceId = task.aimInstanceId;
  }

  const explicitCompletedAt = task.completedAt ? new Date(task.completedAt) : null;

  return {
    ownerId,
    goalId,
    taskType: (task.taskType as any) ?? 'IMPROVE',
    title: task.title,
    description: task.description ?? null,
    successCriteria: task.successCriteria ?? null,
    status: (task.status as any) ?? 'TODO',
    priority: (task.priority as any) ?? 'MEDIUM',
    dueDate: task.dueDate ? new Date(task.dueDate) : null,
    startedAt: task.startedAt ? new Date(task.startedAt) : null,
    completedAt: explicitCompletedAt ?? (task.status === 'DONE' ? new Date() : null),
    failedAt: task.failedAt ? new Date(task.failedAt) : null,
    rescheduledTo: task.rescheduledTo ? new Date(task.rescheduledTo) : null,
    estimatedMinutes: task.estimatedMinutes ?? 60,
    timeBlockStart: task.timeBlockStart ? new Date(task.timeBlockStart) : null,
    timeBlockEnd: task.timeBlockEnd ? new Date(task.timeBlockEnd) : null,
    recurrenceRule: task.recurrenceRule ?? null,
    isWinTheDay: task.isWinTheDay ?? false,
    winTheDayRank: task.winTheDayRank ?? null,
    isPinned: task.isPinned ?? false,
    isAutoScheduled: task.isAutoScheduled ?? false,
    parentId,
    processId,
    aimInstanceId,
    calendarEventId: task.calendarEventId ?? null,
    assigneeId,
  };
}

/**
 * Apply meta.links → GoalLink rows. Resolution:
 *   - companyGoalId: by title within the current stack (warn on miss / on >1 match → first).
 *   - individualGoalId: by (user email → user.id) → goal title in any stack owned by that user.
 * Deletes current links not present in incoming.
 */
async function applyMetaLinks(
  stackId: string,
  incomingLinks: NonNullable<YamlMeta['links']>,
  warn: (msg: string) => void
) {
  const currentLinks = await prisma.goalLink.findMany({
    where: { companyGoal: { stackId, deletedAt: null } },
    include: {
      companyGoal: { select: { title: true } },
      individualGoal: {
        include: { stack: { include: { owner: { select: { email: true } } } } },
      },
    },
  });

  type Triple = { companyTitle: string; userEmail: string; goalTitle: string };
  const tripleKey = (t: Triple) => `${t.companyTitle}\0${t.userEmail}\0${t.goalTitle}`;
  const currentByKey = new Map(
    currentLinks.map((l) => [
      tripleKey({
        companyTitle: l.companyGoal.title,
        userEmail: l.individualGoal.stack?.owner?.email ?? '',
        goalTitle: l.individualGoal.title,
      }),
      l,
    ])
  );
  const incomingKeys = new Set<string>();

  for (const link of incomingLinks) {
    const companyTitle = link.company_goal;
    for (const ig of link.individual_goals ?? []) {
      const userEmail = ig.user;
      const goalTitle = ig.goal;
      const key = tripleKey({ companyTitle, userEmail, goalTitle });
      incomingKeys.add(key);
      if (currentByKey.has(key)) continue;

      // Resolve companyGoalId
      const companyMatches = await prisma.goal.findMany({
        where: { stackId, title: companyTitle, deletedAt: null },
        select: { id: true },
      });
      if (companyMatches.length === 0) {
        warn(`meta.links: company goal "${companyTitle}" not found in stack`);
        continue;
      }
      if (companyMatches.length > 1) {
        warn(`meta.links: multiple company goals titled "${companyTitle}"; using first`);
      }
      const companyGoalId = companyMatches[0].id;

      // Resolve individualGoalId
      const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
      if (!user) {
        warn(`meta.links: unknown user email "${userEmail}"`);
        continue;
      }
      const individualMatches = await prisma.goal.findMany({
        where: {
          title: goalTitle,
          deletedAt: null,
          stack: { ownerId: user.id },
        },
        select: { id: true },
      });
      if (individualMatches.length === 0) {
        warn(`meta.links: goal "${goalTitle}" for user "${userEmail}" not found`);
        continue;
      }
      if (individualMatches.length > 1) {
        warn(`meta.links: multiple goals titled "${goalTitle}" for user "${userEmail}"; using first`);
      }
      const individualGoalId = individualMatches[0].id;

      await prisma.goalLink.create({ data: { companyGoalId, individualGoalId } });
    }
  }

  // Remove links that aren't in the incoming set.
  const linksToRemove: string[] = [];
  currentByKey.forEach((link, key) => {
    if (!incomingKeys.has(key)) linksToRemove.push(link.id);
  });
  for (const id of linksToRemove) {
    await prisma.goalLink.delete({ where: { id } });
  }
}

/**
 * Apply meta.company_assignments → CompanyGoalAssignment rows. Email resolved
 * via the shared cache; unknown email warns and skips.
 */
async function applyCompanyAssignments(
  stackId: string,
  incoming: NonNullable<YamlMeta['company_assignments']>,
  actorUserId: string,
  resolveUserId: (email: string | undefined | null) => Promise<string | null>,
  warn: (msg: string) => void
) {
  const current = await prisma.companyGoalAssignment.findMany({
    where: { goalStackId: stackId },
    include: { user: { select: { email: true } } },
  });
  const incomingByEmail = new Map(incoming.map((a) => [a.user, a]));
  const currentByEmail = new Map(current.map((a) => [a.user.email, a]));

  const incomingEntries: [string, (typeof incoming)[number]][] = [];
  incomingByEmail.forEach((a, email) => incomingEntries.push([email, a]));
  for (const [email, a] of incomingEntries) {
    const userId = await resolveUserId(email);
    if (!userId) {
      warn(`meta.company_assignments: unknown user email "${email}"`);
      continue;
    }
    await prisma.companyGoalAssignment.upsert({
      where: { goalStackId_userId: { goalStackId: stackId, userId } },
      create: {
        goalStackId: stackId,
        userId,
        notes: a.notes ?? null,
        assignedById: actorUserId,
      },
      update: { notes: a.notes ?? null },
    });
  }

  const toDelete: string[] = [];
  currentByEmail.forEach((existing, email) => {
    if (!incomingByEmail.has(email)) toDelete.push(existing.id);
  });
  for (const id of toDelete) {
    await prisma.companyGoalAssignment.delete({ where: { id } });
  }
}
