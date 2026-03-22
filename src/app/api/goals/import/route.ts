import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { goalLimiter, getClientIp } from '@/lib/rate-limit';
import { parseYamlToGoals, diffGoals, buildGoalTree, type GoalNode } from '@/lib/yaml-handler';
import { cascadeProgressUp } from '@/lib/progress';

export const MAX_YAML_SIZE = 256 * 1024; // 256KB

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = goalLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

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
  });

  const currentTree = buildGoalTree(currentDbGoals);
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
  await createNewGoals(incomingGoals, stackId, null);

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
      changeSummary: `${diff.added.length} added, ${diff.deleted.length} deleted, ${diff.modified.length} modified`,
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

async function createNewGoals(
  nodes: GoalNode[],
  stackId: string,
  parentId: string | null
) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.id) {
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
      // Recurse for children of this new goal
      if (node.children?.length) {
        await createNewGoals(node.children, stackId, created.id);
      }
    } else if (node.children?.length) {
      // Existing goal — recurse into children to find new ones
      await createNewGoals(node.children, stackId, node.id);
    }
  }
}
