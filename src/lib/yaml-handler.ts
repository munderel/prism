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
  taskType?: string;
  // Round-trip additions
  parentId?: string;
  processId?: string;
  aimInstanceId?: string;
  calendarEventId?: string;
  assignee?: string;           // email
  deliverableDone?: boolean;
  successCriteria?: unknown;   // JSON passthrough
  isPinned?: boolean;
  isAutoScheduled?: boolean;
  winTheDayRank?: number;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  rescheduledTo?: string;
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
  owner?: string;              // email
  sortOrder?: number;
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
  sortOrder?: number;
  assignees?: string[];        // emails
}

export interface YamlMeta {
  name: string;
  owner: string;
  is_company: boolean;
  exported_at: string;
  mtp?: string;
  links?: { company_goal: string; individual_goals: { user: string; goal: string }[] }[];
  visibility?: string;
  week_start_day?: number;
  company_assignments?: { user: string; notes?: string }[];
}

export interface GoalDiffChange {
  from: unknown;
  to: unknown;
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

export interface MetaDiff {
  visibility?: GoalDiffChange;
  weekStartDay?: GoalDiffChange;
  companyAssignmentsAdded: { user: string; notes?: string }[];
  companyAssignmentsRemoved: { user: string }[];
  companyAssignmentsModified: { user: string; changes: Record<string, GoalDiffChange> }[];
  linksAdded: { companyGoal: string; user: string; goal: string }[];
  linksRemoved: { companyGoal: string; user: string; goal: string }[];
}

export interface GoalDiff {
  added: GoalNode[];
  deleted: { id: string; title: string }[];
  modified: { id: string; title: string; changes: Record<string, GoalDiffChange> }[];
  kpiChanges: KpiDiffEntry[];
  taskChanges: TaskDiffEntry[];
  meta?: MetaDiff;
  warnings: string[];
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
  if (node.sortOrder != null && node.sortOrder !== 0) obj.sort_order = node.sortOrder;
  if (node.assignees?.length) obj.assignees = [...node.assignees];

  if (node.tasks?.length) {
    obj.tasks = node.tasks.map((t) => {
      const tObj: Record<string, any> = {};
      if (t.id) tObj.id = t.id;
      tObj.title = t.title;
      if (t.description) tObj.description = t.description;
      if (t.deliverable) tObj.deliverable = t.deliverable;
      if (t.deliverableDone) tObj.deliverable_done = true;
      if (t.successCriteria !== undefined && t.successCriteria !== null) {
        tObj.success_criteria = t.successCriteria;
      }
      if (t.status && t.status !== 'TODO') tObj.status = t.status;
      if (t.priority && t.priority !== 'MEDIUM') tObj.priority = t.priority;
      if (t.taskType && t.taskType !== 'IMPROVE') tObj.task_type = t.taskType;
      if (t.dueDate) tObj.date = t.dueDate;
      if (t.estimatedMinutes != null) tObj.estimated_minutes = t.estimatedMinutes;
      if (t.timeBlockStart) tObj.time_block_start = t.timeBlockStart;
      if (t.timeBlockEnd) tObj.time_block_end = t.timeBlockEnd;
      if (t.recurrenceRule) tObj.recurrence_rule = t.recurrenceRule;
      if (t.isWinTheDay) tObj.win_the_day = true;
      if (t.winTheDayRank != null) tObj.win_the_day_rank = t.winTheDayRank;
      if (t.isPinned) tObj.is_pinned = true;
      if (t.isAutoScheduled) tObj.is_auto_scheduled = true;
      if (t.preferredTimeStart) tObj.preferred_time_start = t.preferredTimeStart;
      if (t.preferredTimeEnd) tObj.preferred_time_end = t.preferredTimeEnd;
      if (t.startedAt) tObj.started_at = t.startedAt;
      if (t.completedAt) tObj.completed_at = t.completedAt;
      if (t.failedAt) tObj.failed_at = t.failedAt;
      if (t.rescheduledTo) tObj.rescheduled_to = t.rescheduledTo;
      if (t.parentId) tObj.parent_task_id = t.parentId;
      if (t.processId) tObj.process_id = t.processId;
      if (t.aimInstanceId) tObj.aim_instance_id = t.aimInstanceId;
      if (t.calendarEventId) tObj.calendar_event_id = t.calendarEventId;
      if (t.assignee) tObj.assignee = t.assignee;
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
      if (k.owner) kObj.owner = k.owner;
      if (k.sortOrder != null && k.sortOrder !== 0) kObj.sort_order = k.sortOrder;
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
  if (obj.sort_order !== undefined) node.sortOrder = obj.sort_order;
  if (Array.isArray(obj.assignees)) {
    node.assignees = obj.assignees.filter((e: unknown): e is string => typeof e === 'string');
  }

  if (obj.tasks && Array.isArray(obj.tasks)) {
    if (level !== 'WEEKLY') {
      throw new Error(
        `Tasks can only exist under WEEKLY goals. Found tasks under ${level} goal: '${obj.title}'`
      );
    }
    node.tasks = obj.tasks.map((t: any) => {
      const task: TaskNode = {
        title: t.title,
        status: t.status ?? 'TODO',
        priority: t.priority ?? 'MEDIUM',
      };
      if (t.id) task.id = t.id;
      if (t.task_type !== undefined) task.taskType = t.task_type;
      if (t.description !== undefined) task.description = t.description;
      if (t.deliverable !== undefined) task.deliverable = t.deliverable;
      if (t.deliverable_done !== undefined) task.deliverableDone = Boolean(t.deliverable_done);
      if (t.success_criteria !== undefined) task.successCriteria = t.success_criteria;
      if (t.date !== undefined) task.dueDate = t.date;
      if (t.estimated_minutes !== undefined) task.estimatedMinutes = t.estimated_minutes;
      if (t.time_block_start !== undefined) task.timeBlockStart = t.time_block_start;
      if (t.time_block_end !== undefined) task.timeBlockEnd = t.time_block_end;
      if (t.recurrence_rule !== undefined) task.recurrenceRule = t.recurrence_rule;
      if (t.win_the_day !== undefined) task.isWinTheDay = Boolean(t.win_the_day);
      if (t.win_the_day_rank !== undefined) task.winTheDayRank = t.win_the_day_rank;
      if (t.is_pinned !== undefined) task.isPinned = Boolean(t.is_pinned);
      if (t.is_auto_scheduled !== undefined) task.isAutoScheduled = Boolean(t.is_auto_scheduled);
      if (t.preferred_time_start !== undefined) task.preferredTimeStart = t.preferred_time_start;
      if (t.preferred_time_end !== undefined) task.preferredTimeEnd = t.preferred_time_end;
      if (t.started_at !== undefined) task.startedAt = t.started_at;
      if (t.completed_at !== undefined) task.completedAt = t.completed_at;
      if (t.failed_at !== undefined) task.failedAt = t.failed_at;
      if (t.rescheduled_to !== undefined) task.rescheduledTo = t.rescheduled_to;
      if (t.parent_task_id !== undefined) task.parentId = t.parent_task_id;
      if (t.process_id !== undefined) task.processId = t.process_id;
      if (t.aim_instance_id !== undefined) task.aimInstanceId = t.aim_instance_id;
      if (t.calendar_event_id !== undefined) task.calendarEventId = t.calendar_event_id;
      if (t.assignee !== undefined) task.assignee = t.assignee;
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
      owner: k.owner,
      sortOrder: k.sort_order,
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

// ---------------------------------------------------------------------------
// Year-based YAML normalisation helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseMonthToDateRange(monthStr: string): { start_date: string; end_date: string } | undefined {
  // "April 2026" → { start_date: "2026-04-01", end_date: "2026-04-30" }
  const match = monthStr.match(/^(\w+)\s+(\d{4})$/);
  if (!match) return undefined;
  const monthIdx = MONTH_NAMES[match[1].toLowerCase()];
  if (monthIdx === undefined) return undefined;
  const year = parseInt(match[2], 10);
  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end = new Date(Date.UTC(year, monthIdx + 1, 0)); // last day of month
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start_date: fmt(start), end_date: fmt(end) };
}

function parseKpiTarget(raw: unknown): { target?: number; unit?: string } {
  if (typeof raw === 'number') return { target: raw };
  if (typeof raw !== 'string') return {};
  let s = raw.trim();
  let unit: string | undefined;

  // Detect unit suffixes
  if (s.endsWith('%') || s.endsWith('%+')) {
    unit = '%';
    s = s.replace(/%\+?$/, '');
  }

  // Strip currency
  s = s.replace(/^\$/, '').replace(/,/g, '');

  // Handle multiplier suffixes
  let multiplier = 1;
  if (/[Mm]$/i.test(s)) { multiplier = 1_000_000; s = s.replace(/[Mm]$/, ''); }
  else if (/[Kk]$/i.test(s)) { multiplier = 1_000; s = s.replace(/[Kk]$/, ''); }

  // Strip trailing +
  s = s.replace(/\+$/, '');

  // Handle ranges like "16-20" → take first number
  const rangeMatch = s.match(/^([\d.]+)\s*-\s*[\d.]+$/);
  if (rangeMatch) s = rangeMatch[1];

  const num = parseFloat(s);
  if (isNaN(num)) return unit ? { unit } : {};
  return { target: num * multiplier, unit };
}

function formatBusinessContext(mg: Record<string, any>): string {
  const parts: string[] = [];
  if (mg.key_goal) parts.push(mg.key_goal);

  if (mg.funnel) {
    const f = mg.funnel;
    parts.push(`Funnel: ${f.leads ?? '?'} leads, ${f.bookings ?? '?'} bookings (${f.lead_to_booking_pct ?? '?'} booking rate), ${f.new_customers ?? '?'} new customers, ${f.chair_utilization ?? '?'} utilization`);
  }
  if (mg.subscriptions) {
    const s = mg.subscriptions;
    parts.push(`Subscriptions: ${s.active_maintenance_members ?? '?'} active members, ${s.maintenance_arpu ?? '?'} ARPU`);
  }
  if (mg.revenue) {
    const r = mg.revenue;
    parts.push(`Revenue: ${r.total ?? '?'} total (${r.subscription_revenue ?? '?'} subscription)`);
  }
  if (mg.profitability) {
    const p = mg.profitability;
    parts.push(`Profitability: ${p.profit ?? '?'} profit (${p.margin ?? '?'} margin), ${p.staff ?? '?'} staff`);
  }
  return parts.join('\n');
}

function normalizeYearBasedYaml(input: Record<string, any>): Record<string, any> {
  // Detect year-based format
  const yearKeys = Object.keys(input)
    .filter((k) => /^year_\d+$/.test(k))
    .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

  if (yearKeys.length === 0) return input;

  // Deep-clone to avoid mutating the parsed input
  const doc: Record<string, any> = JSON.parse(JSON.stringify(input));

  // Build HHG description from extra fields
  const hhg = doc.high_hard_goal ?? {};
  const descParts: string[] = [];
  if (hhg.description) descParts.push(hhg.description);
  if (hhg.confidence != null) descParts.push(`Confidence: ${hhg.confidence}/10`);
  if (hhg.success_criteria?.length) {
    descParts.push('Success Criteria:\n' + hhg.success_criteria.map((c: string) => `- ${c}`).join('\n'));
  }
  if (hhg.people_helped) {
    const ph = hhg.people_helped;
    descParts.push(`People Helped: ${ph.cumulative_people_served ?? '?'} cumulative, ${ph.active_subscribers_by_y5 ?? '?'} active subs by Y5`);
  }
  if (descParts.length) hhg.description = descParts.join('\n\n');

  // Normalise HHG KPIs
  if (hhg.kpis) {
    hhg.kpis = hhg.kpis.map((k: any) => {
      const parsed = parseKpiTarget(k.target);
      return { ...k, type: k.type ?? 'numeric', target: parsed.target, unit: parsed.unit ?? k.unit };
    });
  }

  // Clean extra HHG keys the parser doesn't know
  delete hhg.confidence;
  delete hhg.people_helped;
  delete hhg.success_criteria;
  delete hhg.operations_overview;

  const allStrategicGoals: Record<string, any>[] = [];

  for (const yearKey of yearKeys) {
    const yearBlock = doc[yearKey];
    const yearStartDate = yearBlock.start_date;
    const yearEndDate = yearBlock.end_date;
    // Build a map of strategic goal id → strategic goal object for back-reference resolution
    const sgMap = new Map<string, Record<string, any>>();
    const strategicGoals: Record<string, any>[] = (yearBlock.strategic_goals ?? []).map((sg: any) => {
      const normalised: Record<string, any> = {
        // NOTE: sg.id (e.g. "SG1") is a YAML back-reference label, NOT a DB id.
        // We store it in sgMap for resolution but must NOT set it on the goal object —
        // createNewGoals skips creation for any node with a non-null id.
        title: sg.title,
        description: sg.why ?? sg.description,
        start_date: sg.start_date ?? yearStartDate,
        end_date: sg.end_date ?? yearEndDate,
        status: sg.status ?? 'NOT_STARTED',
        monthly_goals: [],
      };

      // Fold deliverables into description (tasks only allowed on WEEKLY goals)
      if (sg.deliverables?.length) {
        const deliverableText = sg.deliverables.map((d: string) => `- ${d}`).join('\n');
        normalised.description = normalised.description
          ? `${normalised.description}\n\nDeliverables:\n${deliverableText}`
          : `Deliverables:\n${deliverableText}`;
      }

      if (sg.kpis) normalised.kpis = sg.kpis;
      if (sg.id) sgMap.set(sg.id, normalised);
      return normalised;
    });

    // Attach yearly_kpis — distribute to each strategic goal in the year
    if (yearBlock.yearly_kpis?.length && strategicGoals.length > 0) {
      const normalisedKpis = yearBlock.yearly_kpis.map((k: any) => {
        const parsed = parseKpiTarget(k.target);
        return { ...k, type: k.type ?? 'numeric', target: parsed.target, unit: parsed.unit ?? k.unit };
      });
      // Attach to the first strategic goal of this year as the primary KPI holder
      strategicGoals[0].kpis = [...(strategicGoals[0].kpis ?? []), ...normalisedKpis];
    }

    // Resolve monthly goals → nest under the correct strategic goal
    if (yearBlock.monthly_goals?.length) {
      for (const mg of yearBlock.monthly_goals) {
        const dateRange = mg.month ? parseMonthToDateRange(mg.month) : undefined;
        const monthTitle = mg.month
          ? `${mg.month}: ${mg.key_goal ?? ''}`
          : (mg.key_goal ?? mg.title ?? 'Monthly Goal');

        const normalisedMonth: Record<string, any> = {
          title: monthTitle,
          description: formatBusinessContext(mg),
          start_date: dateRange?.start_date ?? mg.start_date,
          end_date: dateRange?.end_date ?? mg.end_date,
          status: mg.status ?? 'NOT_STARTED',
        };

        if (mg.kpis) normalisedMonth.kpis = mg.kpis;
        if (mg.weekly_goals) normalisedMonth.weekly_goals = mg.weekly_goals;

        // Resolve strategic_goals back-references
        const sgRefs: string[] = mg.strategic_goals ?? [];
        let placed = false;
        for (const ref of sgRefs) {
          const parent = sgMap.get(String(ref));
          if (parent) {
            parent.monthly_goals.push(normalisedMonth);
            placed = true;
            break; // place under first matching SG
          }
        }
        // If no valid reference, place under first strategic goal
        if (!placed && strategicGoals.length > 0) {
          if (sgRefs.length > 0) {
            console.warn(`Monthly goal "${normalisedMonth.title}" references unknown SGs [${sgRefs}], placing under "${strategicGoals[0].title}"`);
          }
          strategicGoals[0].monthly_goals.push(normalisedMonth);
        }
      }
    }

    allStrategicGoals.push(...strategicGoals);
    delete doc[yearKey];
  }

  // Clean subscription_model (reference data, not a goal)
  delete doc.subscription_model;

  // Attach all strategic goals to HHG
  hhg.strategic_goals = allStrategicGoals;
  doc.high_hard_goal = hhg;

  return doc;
}

// ---------------------------------------------------------------------------

export function parseYamlToGoals(yamlContent: string): { goals: GoalNode[]; meta: YamlMeta } {
  // Critical #8 — JSON_SCHEMA narrows yaml.load to the JSON-equivalent type
  // set: strings, numbers, booleans, nulls, mappings, sequences. This blocks
  // every custom !! type (including !!timestamp, !!omap, !!set, !!binary,
  // and — if an older js-yaml ever reappears — !!js/function / !!js/regexp)
  // while still preserving number/boolean typing that downstream Zod
  // schemas depend on. FAILSAFE is stricter but silently stringifies
  // numeric impact/confidence/ease scores, which breaks validation.
  const raw = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA }) as Record<string, any>;
  const doc = normalizeYearBasedYaml(raw);
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

function toIsoString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
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
      sortOrder: g.sortOrder ?? undefined,
      children: [],
    };

    if (Array.isArray(g.assignees) && g.assignees.length > 0) {
      const emails = g.assignees
        .map((a: any) => a.user?.email)
        .filter((e: unknown): e is string => typeof e === 'string');
      if (emails.length > 0) node.assignees = emails;
    }

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
        owner: k.owner?.email ?? undefined,
        sortOrder: k.sortOrder ?? undefined,
      }));
    }

    // Include tasks if present on DB record
    if (g.tasks?.length) {
      node.tasks = g.tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? undefined,
        deliverable: t.deliverable ?? undefined,
        deliverableDone: t.deliverableDone || undefined,
        successCriteria: t.successCriteria ?? undefined,
        status: t.status,
        priority: t.priority,
        dueDate: toIsoString(t.dueDate),
        estimatedMinutes: t.estimatedMinutes ?? undefined,
        timeBlockStart: toIsoString(t.timeBlockStart),
        timeBlockEnd: toIsoString(t.timeBlockEnd),
        recurrenceRule: t.recurrenceRule ?? undefined,
        isWinTheDay: t.isWinTheDay || undefined,
        winTheDayRank: t.winTheDayRank ?? undefined,
        isPinned: t.isPinned || undefined,
        isAutoScheduled: t.isAutoScheduled || undefined,
        preferredTimeStart: t.preferredTimeStart ?? undefined,
        preferredTimeEnd: t.preferredTimeEnd ?? undefined,
        taskType: t.taskType ?? undefined,
        startedAt: toIsoString(t.startedAt),
        completedAt: toIsoString(t.completedAt),
        failedAt: toIsoString(t.failedAt),
        rescheduledTo: toIsoString(t.rescheduledTo),
        parentId: t.parentId ?? undefined,
        processId: t.processId ?? undefined,
        aimInstanceId: t.aimInstanceId ?? undefined,
        calendarEventId: t.calendarEventId ?? undefined,
        assignee: t.assignee?.email ?? undefined,
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
  'sortOrder',
];
const KPI_DIFF_FIELDS: (keyof KpiNode)[] = [
  'type',
  'unit',
  'target',
  'actual',
  'complete',
  'completed_at',
  'linked_to',
  'owner',
  'sortOrder',
];
const TASK_DIFF_FIELDS: (keyof TaskNode)[] = [
  'title',
  'description',
  'deliverable',
  'deliverableDone',
  'status',
  'priority',
  'taskType',
  'dueDate',
  'estimatedMinutes',
  'timeBlockStart',
  'timeBlockEnd',
  'recurrenceRule',
  'isWinTheDay',
  'winTheDayRank',
  'isPinned',
  'isAutoScheduled',
  'preferredTimeStart',
  'preferredTimeEnd',
  'startedAt',
  'completedAt',
  'failedAt',
  'rescheduledTo',
  'parentId',
  'processId',
  'aimInstanceId',
  'calendarEventId',
  'assignee',
];

// Fields whose values are JSON-like objects/arrays. Strict !== always returns
// "changed" for these because each parse produces a new reference, so compare
// by JSON.stringify instead. Stable key order is preserved by both Prisma and
// js-yaml for plain objects, so this round-trips correctly in practice.
const JSON_DEEP_EQUAL_FIELDS = new Set<string>(['successCriteria']);

function diffFields<T>(current: T, incoming: T, fields: (keyof T)[]): Record<string, GoalDiffChange> {
  const changes: Record<string, GoalDiffChange> = {};
  for (const field of fields) {
    const cur = current[field];
    const inc = incoming[field];
    if (JSON_DEEP_EQUAL_FIELDS.has(field as string)) {
      if (JSON.stringify(cur) !== JSON.stringify(inc)) {
        changes[field as string] = { from: cur, to: inc };
      }
    } else if (cur !== inc) {
      changes[field as string] = { from: cur, to: inc };
    }
  }
  return changes;
}

function diffAssignees(
  current: string[] | undefined,
  incoming: string[] | undefined
): { added: string[]; removed: string[] } | null {
  const cur = new Set(current ?? []);
  const inc = new Set(incoming ?? []);
  const added: string[] = [];
  const removed: string[] = [];
  inc.forEach((e) => { if (!cur.has(e)) added.push(e); });
  cur.forEach((e) => { if (!inc.has(e)) removed.push(e); });
  if (added.length === 0 && removed.length === 0) return null;
  return { added, removed };
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

export function diffGoals(
  current: GoalNode[],
  incoming: GoalNode[],
  currentMeta?: Partial<YamlMeta>,
  incomingMeta?: Partial<YamlMeta>
): GoalDiff {
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

    // Assignees: emit as paired {added,removed} entries inside the same
    // `changes` map so existing consumers iterating Object.keys() still work.
    const assigneesDiff = diffAssignees(currentNode.assignees, incomingNode.assignees);
    if (assigneesDiff) {
      if (assigneesDiff.added.length > 0) {
        changes.assignees_added = { from: [], to: assigneesDiff.added };
      }
      if (assigneesDiff.removed.length > 0) {
        changes.assignees_removed = { from: assigneesDiff.removed, to: [] };
      }
    }

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

  const meta = diffMeta(currentMeta, incomingMeta);
  return { added, deleted, modified, kpiChanges, taskChanges, meta, warnings: [] };
}

function diffMeta(
  current: Partial<YamlMeta> | undefined,
  incoming: Partial<YamlMeta> | undefined
): MetaDiff | undefined {
  if (!current && !incoming) return undefined;
  const cur = current ?? {};
  const inc = incoming ?? {};

  const result: MetaDiff = {
    companyAssignmentsAdded: [],
    companyAssignmentsRemoved: [],
    companyAssignmentsModified: [],
    linksAdded: [],
    linksRemoved: [],
  };
  let touched = false;

  if (inc.visibility !== undefined && cur.visibility !== inc.visibility) {
    result.visibility = { from: cur.visibility, to: inc.visibility };
    touched = true;
  }
  if (inc.week_start_day !== undefined && cur.week_start_day !== inc.week_start_day) {
    result.weekStartDay = { from: cur.week_start_day, to: inc.week_start_day };
    touched = true;
  }

  // Company assignments — match by user email.
  const curAssign = new Map((cur.company_assignments ?? []).map((a) => [a.user, a]));
  const incAssign = new Map((inc.company_assignments ?? []).map((a) => [a.user, a]));
  incAssign.forEach((a, user) => {
    const existing = curAssign.get(user);
    if (!existing) {
      result.companyAssignmentsAdded.push({ user, notes: a.notes });
      touched = true;
    } else if ((existing.notes ?? null) !== (a.notes ?? null)) {
      result.companyAssignmentsModified.push({
        user,
        changes: { notes: { from: existing.notes ?? null, to: a.notes ?? null } },
      });
      touched = true;
    }
  });
  curAssign.forEach((_a, user) => {
    if (!incAssign.has(user)) {
      result.companyAssignmentsRemoved.push({ user });
      touched = true;
    }
  });

  // Links — flatten both sides to (companyGoal, user, goal) triples.
  type LinkTriple = { companyGoal: string; user: string; goal: string };
  const flatten = (links: YamlMeta['links']): LinkTriple[] => {
    const out: LinkTriple[] = [];
    for (const l of links ?? []) {
      for (const ig of l.individual_goals ?? []) {
        out.push({ companyGoal: l.company_goal, user: ig.user, goal: ig.goal });
      }
    }
    return out;
  };
  const key = (l: LinkTriple) => `${l.companyGoal} ${l.user} ${l.goal}`;
  const curLinks = new Map(flatten(cur.links).map((l) => [key(l), l]));
  const incLinks = new Map(flatten(inc.links).map((l) => [key(l), l]));
  incLinks.forEach((l, k) => {
    if (!curLinks.has(k)) {
      result.linksAdded.push(l);
      touched = true;
    }
  });
  curLinks.forEach((l, k) => {
    if (!incLinks.has(k)) {
      result.linksRemoved.push(l);
      touched = true;
    }
  });

  return touched ? result : undefined;
}
