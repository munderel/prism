import yaml from 'js-yaml';

export interface TaskNode {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

export interface KpiNode {
  name: string;
  type: string;
  unit?: string;
  target?: number;
  actual?: number;
  complete?: boolean;
  completed_at?: string;
  linked_to?: string;
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
  kpis?: KpiNode[];
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

export interface KpiDiffEntry {
  goalTitle: string;
  added: { name: string; type: string }[];
  removed: { name: string; type: string }[];
  modified: { name: string; changes: Record<string, GoalDiffChange> }[];
}

export interface GoalDiff {
  added: GoalNode[];
  deleted: { id: string; title: string }[];
  modified: { id: string; title: string; changes: Record<string, GoalDiffChange> }[];
  kpiChanges: KpiDiffEntry[];
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

  if (node.kpis?.length) {
    obj.kpis = node.kpis.map((k) => {
      const kObj: Record<string, any> = { name: k.name, type: k.type.toLowerCase() };
      if (k.unit) kObj.unit = k.unit;
      if (k.target != null) kObj.target = k.target;
      if (k.actual != null) kObj.actual = k.actual;
      if (k.complete) kObj.complete = k.complete;
      if (k.completed_at) kObj.completed_at = k.completed_at;
      if (k.linked_to) kObj.linked_to = k.linked_to;
      return kObj;
    });
  }

  const childKey = LEVEL_TO_CHILD_KEY[node.level];
  if (childKey && node.children?.length) {
    obj[childKey] = node.children.map(goalToSemanticObj);
  }

  return obj;
}

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

  if (obj.kpis && Array.isArray(obj.kpis)) {
    node.kpis = obj.kpis.map((k: any) => ({
      name: k.name,
      type: (k.type ?? 'numeric').toUpperCase(),
      unit: k.unit,
      target: k.target,
      actual: k.actual,
      complete: k.complete,
      completed_at: k.completed_at,
      linked_to: k.linked_to,
    }));
  }

  const childKey = LEVEL_TO_CHILD_KEY[level];
  if (childKey && obj[childKey]) {
    const childLevel = KEY_TO_LEVEL[childKey];
    node.children = obj[childKey].map((c: any) => semanticObjToGoals(c, childLevel));
  }

  return node;
}

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

export function buildGoalTree(goals: any[]): GoalNode[] {
  const map = new Map<string, GoalNode>();
  const roots: GoalNode[] = [];

  for (const g of goals) {
    const node: GoalNode = {
      id: g.id,
      level: g.level,
      title: g.title,
      description: g.description ?? undefined,
      status: g.status,
      dueDate: g.dueDate?.toISOString?.() ?? (typeof g.dueDate === 'string' ? g.dueDate : undefined),
      children: [],
    };

    // Include KPIs if present on DB record
    if (g.kpis?.length) {
      node.kpis = g.kpis.map((k: any) => ({
        name: k.name,
        type: k.type,
        unit: k.unit ?? undefined,
        target: k.targetValue ?? undefined,
        actual: k.actualValue ?? undefined,
        complete: k.type === 'BINARY' ? k.isComplete : undefined,
        completed_at: k.completedAt?.toISOString?.() ?? undefined,
        linked_to: k._linkedKpiName ?? undefined,
      }));
    }

    map.set(g.id, node);
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
const KPI_DIFF_FIELDS: (keyof KpiNode)[] = ['type', 'unit', 'target', 'actual', 'complete'];

function diffFields<T>(current: T, incoming: T, fields: (keyof T)[]): Record<string, GoalDiffChange> {
  const changes: Record<string, GoalDiffChange> = {};
  for (const field of fields) {
    if (current[field] !== incoming[field]) {
      changes[field as string] = { from: current[field], to: incoming[field] };
    }
  }
  return changes;
}

function diffKpis(currentKpis: KpiNode[], incomingKpis: KpiNode[]): Omit<KpiDiffEntry, 'goalTitle'> | null {
  if (currentKpis.length === 0 && incomingKpis.length === 0) return null;

  const currentByName = new Map(currentKpis.map((k) => [k.name, k]));
  const incomingByName = new Map(incomingKpis.map((k) => [k.name, k]));

  const added: KpiDiffEntry['added'] = [];
  const removed: KpiDiffEntry['removed'] = [];
  const modified: KpiDiffEntry['modified'] = [];

  incomingByName.forEach((kpi, name) => {
    const currentKpi = currentByName.get(name);
    if (!currentKpi) {
      added.push({ name, type: kpi.type });
      return;
    }
    const changes = diffFields(currentKpi, kpi, KPI_DIFF_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ name, changes });
    }
  });

  currentByName.forEach((kpi, name) => {
    if (!incomingByName.has(name)) {
      removed.push({ name, type: kpi.type });
    }
  });

  if (added.length === 0 && removed.length === 0 && modified.length === 0) return null;
  return { added, removed, modified };
}

export function diffGoals(current: GoalNode[], incoming: GoalNode[]): GoalDiff {
  const currentMap = flattenGoals(current);
  const incomingMap = flattenGoals(incoming);

  const added = collectNewGoals(incoming);

  const deleted: GoalDiff['deleted'] = [];
  currentMap.forEach((node, id) => {
    if (!incomingMap.has(id)) {
      deleted.push({ id, title: node.title });
    }
  });

  const modified: GoalDiff['modified'] = [];
  const kpiChanges: KpiDiffEntry[] = [];

  incomingMap.forEach((incomingNode, id) => {
    const currentNode = currentMap.get(id);
    if (!currentNode) return;

    const changes = diffFields(currentNode, incomingNode, DIFF_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ id, title: incomingNode.title, changes });
    }

    const kpiDiff = diffKpis(currentNode.kpis ?? [], incomingNode.kpis ?? []);
    if (kpiDiff) {
      kpiChanges.push({ goalTitle: incomingNode.title, ...kpiDiff });
    }
  });

  return { added, deleted, modified, kpiChanges };
}
