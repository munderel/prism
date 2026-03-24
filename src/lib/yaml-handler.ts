import yaml from 'js-yaml';

export interface TaskNode {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

export interface GoalNode {
  id?: string;
  level: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  children?: GoalNode[];
  tasks?: TaskNode[];
}

export interface YamlMeta {
  name: string;
  owner: string;
  is_company: boolean;
  exported_at: string;
  mtp?: string;
  links?: { company_goal: string; individual_goals: { user: string; goal: string }[] }[];
}

export interface GoalDiffChange {
  from: any;
  to: any;
}

export interface GoalDiff {
  added: GoalNode[];
  deleted: { id: string; title: string }[];
  modified: { id: string; title: string; changes: Record<string, GoalDiffChange> }[];
}

// Maps GoalLevel to YAML child key name
const LEVEL_TO_CHILD_KEY: Record<string, string> = {
  HIGH_HARD: 'strategic_goals',
  STRATEGIC: 'monthly_goals',
  MONTHLY: 'weekly_goals',
  WEEKLY: 'daily_goals',
};

// Maps YAML key to GoalLevel
const KEY_TO_LEVEL: Record<string, string> = {
  high_hard_goal: 'HIGH_HARD',
  strategic_goals: 'STRATEGIC',
  monthly_goals: 'MONTHLY',
  weekly_goals: 'WEEKLY',
  daily_goals: 'DAILY',
};

/**
 * Convert a GoalNode to the spec's semantic YAML object.
 */
function goalToSemanticObj(node: GoalNode): Record<string, any> {
  const obj: Record<string, any> = { title: node.title };
  if (node.id) obj.id = node.id;
  if (node.description) obj.description = node.description;
  if (node.status && node.status !== 'NOT_STARTED') obj.status = node.status;
  if (node.dueDate) obj.date = node.dueDate;

  if (node.tasks?.length) {
    obj.tasks = node.tasks.map((t) => {
      const tObj: Record<string, any> = { title: t.title };
      if (t.description) tObj.description = t.description;
      if (t.status && t.status !== 'TODO') tObj.status = t.status;
      if (t.priority && t.priority !== 'MEDIUM') tObj.priority = t.priority;
      if (t.dueDate) tObj.date = t.dueDate;
      return tObj;
    });
  }

  const childKey = LEVEL_TO_CHILD_KEY[node.level];
  if (childKey && node.children?.length) {
    obj[childKey] = node.children.map(goalToSemanticObj);
  }

  return obj;
}

/**
 * Parse a semantic YAML object back into GoalNode(s).
 */
function semanticObjToGoals(obj: Record<string, any>, level: string): GoalNode {
  const node: GoalNode = {
    title: obj.title,
    level,
    status: obj.status ?? 'NOT_STARTED',
    children: [],
  };
  if (obj.id) node.id = obj.id;
  if (obj.description) node.description = obj.description;
  if (obj.date) node.dueDate = obj.date;

  if (obj.tasks && Array.isArray(obj.tasks)) {
    node.tasks = obj.tasks.map((t: any) => ({
      title: t.title,
      description: t.description,
      status: t.status ?? 'TODO',
      priority: t.priority ?? 'MEDIUM',
      dueDate: t.date,
    }));
  }

  const childKey = LEVEL_TO_CHILD_KEY[level];
  if (childKey && obj[childKey]) {
    const childLevel = KEY_TO_LEVEL[childKey];
    node.children = obj[childKey].map((c: any) => semanticObjToGoals(c, childLevel));
  }

  return node;
}

/**
 * Export goal tree to spec-compliant YAML with meta section.
 */
export function exportGoalsToYaml(goals: GoalNode[], meta: YamlMeta): string {
  const doc: Record<string, any> = { meta };

  // The spec format has a single high_hard_goal at root level
  if (goals.length === 1 && goals[0].level === 'HIGH_HARD') {
    doc.high_hard_goal = goalToSemanticObj(goals[0]);
  } else {
    // Multiple roots or non-HHG roots — use array
    doc.goals = goals.map(goalToSemanticObj);
  }

  return yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
}

/**
 * Parse spec-compliant YAML back to GoalNode array + meta.
 */
export function parseYamlToGoals(yamlContent: string): { goals: GoalNode[]; meta: YamlMeta } {
  const doc = yaml.load(yamlContent) as Record<string, any>;
  const meta: YamlMeta = doc.meta ?? { name: '', owner: '', is_company: false, exported_at: '' };

  const goals: GoalNode[] = [];

  if (doc.high_hard_goal) {
    goals.push(semanticObjToGoals(doc.high_hard_goal, 'HIGH_HARD'));
  }

  if (doc.goals) {
    // Fallback: array of goals with explicit levels
    for (const g of doc.goals) {
      goals.push(semanticObjToGoals(g, g.level ?? 'HIGH_HARD'));
    }
  }

  return { goals, meta };
}

/**
 * Build a GoalNode tree from flat DB goals (shared by export + import routes).
 */
export function buildGoalTree(goals: any[]): GoalNode[] {
  const map = new Map<string, GoalNode>();
  const roots: GoalNode[] = [];

  for (const g of goals) {
    map.set(g.id, {
      id: g.id,
      level: g.level,
      title: g.title,
      description: g.description ?? undefined,
      status: g.status,
      dueDate: g.dueDate?.toISOString?.() ?? (typeof g.dueDate === 'string' ? g.dueDate : undefined),
      children: [],
    });
  }

  for (const g of goals) {
    const node = map.get(g.id)!;
    if (g.parentId && map.has(g.parentId)) {
      map.get(g.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Flatten a goal tree into a map of id → GoalNode for comparison.
 */
function flattenGoals(
  nodes: GoalNode[],
  map: Map<string, GoalNode> = new Map()
): Map<string, GoalNode> {
  for (const node of nodes) {
    if (node.id) {
      map.set(node.id, node);
    }
    if (node.children) {
      flattenGoals(node.children, map);
    }
  }
  return map;
}

/**
 * Collect all goals without IDs (new goals from YAML import).
 */
function collectNewGoals(nodes: GoalNode[]): GoalNode[] {
  const result: GoalNode[] = [];
  for (const node of nodes) {
    if (!node.id) {
      result.push(node);
    }
    if (node.children) {
      result.push(...collectNewGoals(node.children));
    }
  }
  return result;
}

const DIFF_FIELDS: (keyof GoalNode)[] = ['title', 'description', 'status', 'level', 'dueDate'];

export function diffGoals(current: GoalNode[], incoming: GoalNode[]): GoalDiff {
  const currentMap = flattenGoals(current);
  const incomingMap = flattenGoals(incoming);

  const added = collectNewGoals(incoming);

  const deleted: GoalDiff['deleted'] = [];
  Array.from(currentMap.entries()).forEach(([id, node]) => {
    if (!incomingMap.has(id)) {
      deleted.push({ id, title: node.title });
    }
  });

  const modified: GoalDiff['modified'] = [];
  Array.from(incomingMap.entries()).forEach(([id, incomingNode]) => {
    const currentNode = currentMap.get(id);
    if (!currentNode) return;

    const changes: Record<string, GoalDiffChange> = {};
    for (const field of DIFF_FIELDS) {
      const from = currentNode[field];
      const to = incomingNode[field];
      if (from !== to) {
        changes[field] = { from, to };
      }
    }
    if (Object.keys(changes).length > 0) {
      modified.push({ id, title: incomingNode.title, changes });
    }
  });

  return { added, deleted, modified };
}
