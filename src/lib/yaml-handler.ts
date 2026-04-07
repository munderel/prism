import yaml from 'js-yaml';

export interface TaskNode {
  id?: string;
  title: string;
  description?: string;
  deliverable?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  timeBlockStart?: string;
  timeBlockEnd?: string;
  recurrenceRule?: string;
  isWinTheDay?: boolean;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
}

export interface KpiNode {
  id?: string;
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
  startDate?: string;
  endDate?: string;
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
  goalId?: string;
  added: { name: string; type: string }[];
  removed: { id?: string; name: string; type: string }[];
  modified: { id?: string; name: string; changes: Record<string, GoalDiffChange> }[];
}

export interface TaskDiffEntry {
  goalTitle: string;
  goalId?: string;
  added: TaskNode[];
  removed: { id?: string; title: string }[];
  modified: { id?: string; title: string; changes: Record<string, GoalDiffChange> }[];
}

export interface GoalDiff {
  added: GoalNode[];
  deleted: { id: string; title: string }[];
  modified: { id: string; title: string; changes: Record<string, GoalDiffChange> }[];
  kpiChanges: KpiDiffEntry[];
  taskChanges: TaskDiffEntry[];
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
  const obj: Record<string, any> = {};
  if (node.id) obj.id = node.id;
  obj.title = node.title;
  if (node.description) obj.description = node.description;
  if (node.status && node.status !== 'NOT_STARTED') obj.status = node.status;
  if (node.dueDate) obj.date = node.dueDate;
  if (node.startDate) obj.start_date = node.startDate;
  if (node.endDate) obj.end_date = node.endDate;

  if (node.tasks?.length) {
    obj.tasks = node.tasks.map((t) => {
      const tObj: Record<string, any> = {};
      if (t.id) tObj.id = t.id;
      tObj.title = t.title;
      if (t.description) tObj.description = t.description;
      if (t.deliverable) tObj.deliverable = t.deliverable;
      if (t.status && t.status !== 'TODO') tObj.status = t.status;
      if (t.priority && t.priority !== 'MEDIUM') tObj.priority = t.priority;
      if (t.dueDate) tObj.date = t.dueDate;
      if (t.estimatedMinutes != null) tObj.estimated_minutes = t.estimatedMinutes;
      if (t.timeBlockStart) tObj.time_block_start = t.timeBlockStart;
      if (t.timeBlockEnd) tObj.time_block_end = t.timeBlockEnd;
      if (t.recurrenceRule) tObj.recurrence_rule = t.recurrenceRule;
      if (t.isWinTheDay) tObj.win_the_day = true;
      if (t.preferredTimeStart) tObj.preferred_time_start = t.preferredTimeStart;
      if (t.preferredTimeEnd) tObj.preferred_time_end = t.preferredTimeEnd;
      return tObj;
    });
  }

  if (node.kpis?.length) {
    obj.kpis = node.kpis.map((k) => {
      const kObj: Record<string, any> = {};
      if (k.id) kObj.id = k.id;
      kObj.name = k.name;
      kObj.type = k.type.toLowerCase();
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
  if (obj.start_date) node.startDate = obj.start_date;
  if (obj.end_date) node.endDate = obj.end_date;

  if (obj.tasks && Array.isArray(obj.tasks)) {
    node.tasks = obj.tasks.map((t: any) => {
      const task: TaskNode = {
        title: t.title,
        status: t.status ?? 'TODO',
        priority: t.priority ?? 'MEDIUM',
      };
      if (t.id) task.id = t.id;
      if (t.description !== undefined) task.description = t.description;
      if (t.deliverable !== undefined) task.deliverable = t.deliverable;
      if (t.date !== undefined) task.dueDate = t.date;
      if (t.estimated_minutes !== undefined) task.estimatedMinutes = t.estimated_minutes;
      if (t.time_block_start !== undefined) task.timeBlockStart = t.time_block_start;
      if (t.time_block_end !== undefined) task.timeBlockEnd = t.time_block_end;
      if (t.recurrence_rule !== undefined) task.recurrenceRule = t.recurrence_rule;
      if (t.win_the_day !== undefined) task.isWinTheDay = Boolean(t.win_the_day);
      if (t.preferred_time_start !== undefined) task.preferredTimeStart = t.preferred_time_start;
      if (t.preferred_time_end !== undefined) task.preferredTimeEnd = t.preferred_time_end;
      return task;
    });
  }

  if (obj.kpis && Array.isArray(obj.kpis)) {
    node.kpis = obj.kpis.map((k: any) => ({
      id: k.id,
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

function toIsoString(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v?.toISOString === 'function') return v.toISOString();
  return undefined;
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
      dueDate: toIsoString(g.dueDate),
      startDate: toIsoString(g.startDate),
      endDate: toIsoString(g.endDate),
      children: [],
    };

    // Include KPIs if present on DB record
    if (g.kpis?.length) {
      node.kpis = g.kpis.map((k: any) => ({
        id: k.id,
        name: k.name,
        type: k.type,
        unit: k.unit ?? undefined,
        target: k.targetValue ?? undefined,
        actual: k.actualValue ?? undefined,
        complete: k.type === 'BINARY' ? k.isComplete : undefined,
        completed_at: toIsoString(k.completedAt),
        linked_to: k._linkedKpiName ?? undefined,
      }));
    }

    // Include tasks if present on DB record
    if (g.tasks?.length) {
      node.tasks = g.tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? undefined,
        deliverable: t.deliverable ?? undefined,
        status: t.status,
        priority: t.priority,
        dueDate: toIsoString(t.dueDate),
        estimatedMinutes: t.estimatedMinutes ?? undefined,
        timeBlockStart: toIsoString(t.timeBlockStart),
        timeBlockEnd: toIsoString(t.timeBlockEnd),
        recurrenceRule: t.recurrenceRule ?? undefined,
        isWinTheDay: t.isWinTheDay || undefined,
        preferredTimeStart: t.preferredTimeStart ?? undefined,
        preferredTimeEnd: t.preferredTimeEnd ?? undefined,
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

const DIFF_FIELDS: (keyof GoalNode)[] = [
  'title',
  'description',
  'status',
  'level',
  'dueDate',
  'startDate',
  'endDate',
];
const KPI_DIFF_FIELDS: (keyof KpiNode)[] = [
  'type',
  'unit',
  'target',
  'actual',
  'complete',
  'completed_at',
  'linked_to',
];
const TASK_DIFF_FIELDS: (keyof TaskNode)[] = [
  'title',
  'description',
  'deliverable',
  'status',
  'priority',
  'dueDate',
  'estimatedMinutes',
  'timeBlockStart',
  'timeBlockEnd',
  'recurrenceRule',
  'isWinTheDay',
  'preferredTimeStart',
  'preferredTimeEnd',
];

function diffFields<T>(current: T, incoming: T, fields: (keyof T)[]): Record<string, GoalDiffChange> {
  const changes: Record<string, GoalDiffChange> = {};
  for (const field of fields) {
    if (current[field] !== incoming[field]) {
      changes[field as string] = { from: current[field], to: incoming[field] };
    }
  }
  return changes;
}

function diffKpis(currentKpis: KpiNode[], incomingKpis: KpiNode[]): Omit<KpiDiffEntry, 'goalTitle' | 'goalId'> | null {
  if (currentKpis.length === 0 && incomingKpis.length === 0) return null;

  // Hybrid matching: prefer id, fall back to name. Track which current KPIs have been
  // matched so they aren't also flagged as removed.
  const currentById = new Map<string, KpiNode>();
  const currentByName = new Map<string, KpiNode>();
  for (const k of currentKpis) {
    if (k.id) currentById.set(k.id, k);
    currentByName.set(k.name, k);
  }

  const matchedCurrent = new Set<KpiNode>();
  const added: KpiDiffEntry['added'] = [];
  const modified: KpiDiffEntry['modified'] = [];

  for (const incoming of incomingKpis) {
    let current: KpiNode | undefined;
    if (incoming.id && currentById.has(incoming.id)) {
      current = currentById.get(incoming.id);
    } else {
      current = currentByName.get(incoming.name);
    }

    if (!current) {
      added.push({ name: incoming.name, type: incoming.type });
      continue;
    }

    matchedCurrent.add(current);
    const changes = diffFields(current, incoming, KPI_DIFF_FIELDS);
    // Title/name rename counts as a change
    if (current.name !== incoming.name) {
      changes.name = { from: current.name, to: incoming.name };
    }
    if (Object.keys(changes).length > 0) {
      modified.push({ id: current.id, name: incoming.name, changes });
    }
  }

  const removed: KpiDiffEntry['removed'] = [];
  for (const current of currentKpis) {
    if (!matchedCurrent.has(current)) {
      removed.push({ id: current.id, name: current.name, type: current.type });
    }
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) return null;
  return { added, removed, modified };
}

function diffTasks(currentTasks: TaskNode[], incomingTasks: TaskNode[]): Omit<TaskDiffEntry, 'goalTitle' | 'goalId'> | null {
  if (currentTasks.length === 0 && incomingTasks.length === 0) return null;

  // Hybrid matching: prefer id, fall back to title within the parent goal.
  const currentById = new Map<string, TaskNode>();
  const currentByTitle = new Map<string, TaskNode>();
  for (const t of currentTasks) {
    if (t.id) currentById.set(t.id, t);
    currentByTitle.set(t.title, t);
  }

  const matchedCurrent = new Set<TaskNode>();
  const added: TaskDiffEntry['added'] = [];
  const modified: TaskDiffEntry['modified'] = [];

  for (const incoming of incomingTasks) {
    let current: TaskNode | undefined;
    if (incoming.id && currentById.has(incoming.id)) {
      current = currentById.get(incoming.id);
    } else {
      current = currentByTitle.get(incoming.title);
    }

    if (!current) {
      added.push(incoming);
      continue;
    }

    matchedCurrent.add(current);
    const changes = diffFields(current, incoming, TASK_DIFF_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ id: current.id, title: incoming.title, changes });
    }
  }

  const removed: TaskDiffEntry['removed'] = [];
  for (const current of currentTasks) {
    if (!matchedCurrent.has(current)) {
      removed.push({ id: current.id, title: current.title });
    }
  }

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
  const taskChanges: TaskDiffEntry[] = [];

  incomingMap.forEach((incomingNode, id) => {
    const currentNode = currentMap.get(id);
    if (!currentNode) return;

    const changes = diffFields(currentNode, incomingNode, DIFF_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ id, title: incomingNode.title, changes });
    }

    const kpiDiff = diffKpis(currentNode.kpis ?? [], incomingNode.kpis ?? []);
    if (kpiDiff) {
      kpiChanges.push({ goalTitle: incomingNode.title, goalId: id, ...kpiDiff });
    }

    const taskDiff = diffTasks(currentNode.tasks ?? [], incomingNode.tasks ?? []);
    if (taskDiff) {
      taskChanges.push({ goalTitle: incomingNode.title, goalId: id, ...taskDiff });
    }
  });

  return { added, deleted, modified, kpiChanges, taskChanges };
}
