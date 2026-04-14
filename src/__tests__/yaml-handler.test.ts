import { describe, it, expect } from 'vitest';
import {
  exportGoalsToYaml,
  parseYamlToGoals,
  diffGoals,
  buildGoalTree,
  type GoalNode,
  type YamlMeta,
} from '@/lib/yaml-handler';

const sampleTree: GoalNode[] = [
  {
    id: 'g1',
    level: 'HIGH_HARD',
    title: 'Reach $1M ARR',
    status: 'IN_PROGRESS',
    children: [
      {
        id: 'g2',
        level: 'STRATEGIC',
        title: 'Double pipeline',
        status: 'NOT_STARTED',
        children: [
          {
            id: 'g3',
            level: 'MONTHLY',
            title: 'Launch SEO campaign',
            status: 'NOT_STARTED',
            children: [],
          },
        ],
      },
    ],
  },
];

const sampleMeta: YamlMeta = {
  name: 'Test Stack',
  owner: 'test@example.com',
  is_company: false,
  exported_at: '2026-03-21T10:00:00Z',
};

describe('exportGoalsToYaml', () => {
  it('serializes using spec semantic format', () => {
    const yaml = exportGoalsToYaml(sampleTree, sampleMeta);
    expect(yaml).toContain('high_hard_goal:');
    expect(yaml).toContain('strategic_goals:');
    expect(yaml).toContain('monthly_goals:');
    expect(yaml).toContain('title: Reach $1M ARR');
    expect(yaml).toContain('title: Double pipeline');
    expect(yaml).toContain('meta:');
    expect(yaml).toContain('name: Test Stack');
    // Should NOT use flat { goals: [...] } format
    expect(yaml).not.toContain('level: HIGH_HARD');
  });
});

describe('parseYamlToGoals', () => {
  it('deserializes spec YAML back to GoalNode array', () => {
    const yaml = exportGoalsToYaml(sampleTree, sampleMeta);
    const { goals, meta } = parseYamlToGoals(yaml);
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe('Reach $1M ARR');
    expect(goals[0].level).toBe('HIGH_HARD');
    expect(goals[0].children).toHaveLength(1);
    expect(goals[0].children![0].title).toBe('Double pipeline');
    expect(goals[0].children![0].level).toBe('STRATEGIC');
    expect(goals[0].children![0].children![0].title).toBe('Launch SEO campaign');
    expect(meta.name).toBe('Test Stack');
  });
});

describe('round-trip', () => {
  it('preserves structure after export then import', () => {
    const yaml = exportGoalsToYaml(sampleTree, sampleMeta);
    const { goals } = parseYamlToGoals(yaml);
    expect(goals[0].title).toBe(sampleTree[0].title);
    expect(goals[0].level).toBe(sampleTree[0].level);
    expect(goals[0].children![0].title).toBe(sampleTree[0].children![0].title);
    expect(goals[0].children![0].children![0].title).toBe(
      sampleTree[0].children![0].children![0].title
    );
  });
});

describe('diffGoals', () => {
  it('returns empty diff for identical trees', () => {
    const diff = diffGoals(sampleTree, sampleTree);
    expect(diff.added).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('detects added goals', () => {
    const incoming: GoalNode[] = [
      {
        ...sampleTree[0],
        children: [
          ...sampleTree[0].children!,
          { level: 'STRATEGIC', title: 'New goal', status: 'NOT_STARTED', children: [] },
        ],
      },
    ];
    const diff = diffGoals(sampleTree, incoming);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].title).toBe('New goal');
  });

  it('detects deleted goals', () => {
    const incoming: GoalNode[] = [
      { ...sampleTree[0], children: [] },
    ];
    const diff = diffGoals(sampleTree, incoming);
    // Both g2 and g3 are missing from incoming
    expect(diff.deleted).toHaveLength(2);
    expect(diff.deleted.map(d => d.title)).toContain('Double pipeline');
    expect(diff.deleted.map(d => d.title)).toContain('Launch SEO campaign');
  });

  it('detects modified goals', () => {
    const incoming: GoalNode[] = [
      {
        ...sampleTree[0],
        children: [
          { ...sampleTree[0].children![0], title: 'Triple pipeline' },
        ],
      },
    ];
    const diff = diffGoals(sampleTree, incoming);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].changes.title).toEqual({
      from: 'Double pipeline',
      to: 'Triple pipeline',
    });
  });
});

describe('buildGoalTree', () => {
  it('converts flat DB goals into tree of GoalNodes', () => {
    const flat = [
      { id: 'g1', parentId: null, level: 'HIGH_HARD', title: 'HHG', description: null, status: 'IN_PROGRESS', dueDate: null, sortOrder: 0 },
      { id: 'g2', parentId: 'g1', level: 'STRATEGIC', title: 'Strat', description: null, status: 'NOT_STARTED', dueDate: null, sortOrder: 0 },
    ];
    const tree = buildGoalTree(flat as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe('HHG');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].title).toBe('Strat');
  });

  it('populates node.tasks from flat DB input including task editor fields', () => {
    const flat = [
      {
        id: 'g1',
        parentId: null,
        level: 'WEEKLY',
        title: 'Week 1',
        description: null,
        status: 'IN_PROGRESS',
        dueDate: null,
        sortOrder: 0,
        tasks: [
          {
            id: 't1',
            title: 'Do the thing',
            description: 'the desc',
            deliverable: 'the deliverable',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            dueDate: new Date('2026-04-10T00:00:00Z'),
            estimatedMinutes: 90,
            timeBlockStart: new Date('2026-04-08T14:00:00Z'),
            timeBlockEnd: new Date('2026-04-08T15:30:00Z'),
            recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
            isWinTheDay: true,
            preferredTimeStart: '09:00',
            preferredTimeEnd: '11:00',
          },
        ],
      },
    ];
    const tree = buildGoalTree(flat as any);
    expect(tree[0].tasks).toHaveLength(1);
    const task = tree[0].tasks![0];
    expect(task.id).toBe('t1');
    expect(task.deliverable).toBe('the deliverable');
    expect(task.priority).toBe('HIGH');
    expect(task.estimatedMinutes).toBe(90);
    expect(task.timeBlockStart).toBe('2026-04-08T14:00:00.000Z');
    expect(task.timeBlockEnd).toBe('2026-04-08T15:30:00.000Z');
    expect(task.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(task.isWinTheDay).toBe(true);
    expect(task.preferredTimeStart).toBe('09:00');
    expect(task.preferredTimeEnd).toBe('11:00');
  });

  it('populates goal startDate and endDate from DB input', () => {
    const flat = [
      {
        id: 'g1',
        parentId: null,
        level: 'STRATEGIC',
        title: 'Strat',
        description: null,
        status: 'IN_PROGRESS',
        dueDate: null,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
        sortOrder: 0,
      },
    ];
    const tree = buildGoalTree(flat as any);
    expect(tree[0].startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(tree[0].endDate).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('round-trip full fidelity', () => {
  const fullTree: GoalNode[] = [
    {
      id: 'g1',
      level: 'HIGH_HARD',
      title: 'HHG',
      status: 'IN_PROGRESS',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      children: [
        {
          id: 'g2',
          level: 'STRATEGIC',
          title: 'Strategic',
          status: 'IN_PROGRESS',
          startDate: '2026-04-01T00:00:00.000Z',
          endDate: '2026-06-30T00:00:00.000Z',
          children: [
            {
              id: 'g3',
              level: 'MONTHLY',
              title: 'Monthly',
              status: 'IN_PROGRESS',
              children: [
                {
                  id: 'g4',
                  level: 'WEEKLY',
                  title: 'Weekly',
                  status: 'IN_PROGRESS',
                  children: [],
                  tasks: [
                    {
                      id: 't1',
                      title: 'Full task',
                      description: 'task desc',
                      deliverable: 'deliverable',
                      status: 'IN_PROGRESS',
                      priority: 'HIGH',
                      dueDate: '2026-04-10T00:00:00.000Z',
                      estimatedMinutes: 90,
                      timeBlockStart: '2026-04-08T14:00:00.000Z',
                      timeBlockEnd: '2026-04-08T15:30:00.000Z',
                      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
                      isWinTheDay: true,
                      preferredTimeStart: '09:00',
                      preferredTimeEnd: '11:00',
                    },
                  ],
                  kpis: [
                    {
                      name: 'Weekly KPI',
                      type: 'NUMERIC',
                      unit: 'teams',
                      target: 3,
                      actual: 1,
                      linked_to: 'Monthly KPI',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  it('preserves all task fields', () => {
    const yaml = exportGoalsToYaml(fullTree, sampleMeta);
    const { goals } = parseYamlToGoals(yaml);
    const task = goals[0].children![0].children![0].children![0].tasks![0];
    expect(task.id).toBe('t1');
    expect(task.title).toBe('Full task');
    expect(task.description).toBe('task desc');
    expect(task.deliverable).toBe('deliverable');
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.priority).toBe('HIGH');
    expect(task.dueDate).toBe('2026-04-10T00:00:00.000Z');
    expect(task.estimatedMinutes).toBe(90);
    expect(task.timeBlockStart).toBe('2026-04-08T14:00:00.000Z');
    expect(task.timeBlockEnd).toBe('2026-04-08T15:30:00.000Z');
    expect(task.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(task.isWinTheDay).toBe(true);
    expect(task.preferredTimeStart).toBe('09:00');
    expect(task.preferredTimeEnd).toBe('11:00');
  });

  it('preserves goal startDate and endDate', () => {
    const yaml = exportGoalsToYaml(fullTree, sampleMeta);
    const { goals } = parseYamlToGoals(yaml);
    expect(goals[0].startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(goals[0].endDate).toBe('2026-12-31T00:00:00.000Z');
    expect(goals[0].children![0].startDate).toBe('2026-04-01T00:00:00.000Z');
  });

  it('preserves KPI linked_to reference', () => {
    const yaml = exportGoalsToYaml(fullTree, sampleMeta);
    const { goals } = parseYamlToGoals(yaml);
    const kpi = goals[0].children![0].children![0].children![0].kpis![0];
    expect(kpi.linked_to).toBe('Monthly KPI');
  });
});

describe('diffGoals with tasks and dates', () => {
  it('reports startDate and endDate as modified', () => {
    const current: GoalNode[] = [
      {
        id: 'g1',
        level: 'STRATEGIC',
        title: 'Strat',
        status: 'IN_PROGRESS',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
        children: [],
      },
    ];
    const incoming: GoalNode[] = [
      {
        id: 'g1',
        level: 'STRATEGIC',
        title: 'Strat',
        status: 'IN_PROGRESS',
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-07-31T00:00:00.000Z',
        children: [],
      },
    ];
    const diff = diffGoals(current, incoming);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].changes.startDate).toBeDefined();
    expect(diff.modified[0].changes.endDate).toBeDefined();
  });

  it('reports task additions, removals, and modifications in taskChanges', () => {
    const current: GoalNode[] = [
      {
        id: 'g1',
        level: 'WEEKLY',
        title: 'Week 1',
        status: 'IN_PROGRESS',
        children: [],
        tasks: [
          { id: 't1', title: 'Keep me', status: 'TODO', priority: 'MEDIUM' },
          { id: 't2', title: 'Modify me', status: 'TODO', priority: 'MEDIUM' },
          { id: 't3', title: 'Remove me', status: 'TODO', priority: 'MEDIUM' },
        ],
      },
    ];
    const incoming: GoalNode[] = [
      {
        id: 'g1',
        level: 'WEEKLY',
        title: 'Week 1',
        status: 'IN_PROGRESS',
        children: [],
        tasks: [
          { id: 't1', title: 'Keep me', status: 'TODO', priority: 'MEDIUM' },
          { id: 't2', title: 'Modify me', status: 'IN_PROGRESS', priority: 'HIGH' },
          { title: 'New task', status: 'TODO', priority: 'MEDIUM' },
        ],
      },
    ];
    const diff = diffGoals(current, incoming);
    expect(diff.taskChanges).toHaveLength(1);
    const entry = diff.taskChanges[0];
    expect(entry.added.map((t) => t.title)).toContain('New task');
    expect(entry.removed.map((t) => t.title)).toContain('Remove me');
    expect(entry.modified.map((t) => t.title)).toContain('Modify me');
    expect(entry.modified[0].changes.status).toBeDefined();
    expect(entry.modified[0].changes.priority).toBeDefined();
  });

  it('diffTasks matches by id first — rename with same id appears as modified', () => {
    const current: GoalNode[] = [
      {
        id: 'g1',
        level: 'WEEKLY',
        title: 'Week 1',
        status: 'IN_PROGRESS',
        children: [],
        tasks: [{ id: 't1', title: 'Old name', status: 'TODO', priority: 'MEDIUM' }],
      },
    ];
    const incoming: GoalNode[] = [
      {
        id: 'g1',
        level: 'WEEKLY',
        title: 'Week 1',
        status: 'IN_PROGRESS',
        children: [],
        tasks: [{ id: 't1', title: 'New name', status: 'TODO', priority: 'MEDIUM' }],
      },
    ];
    const diff = diffGoals(current, incoming);
    expect(diff.taskChanges).toHaveLength(1);
    const entry = diff.taskChanges[0];
    expect(entry.added).toHaveLength(0);
    expect(entry.removed).toHaveLength(0);
    expect(entry.modified).toHaveLength(1);
    expect(entry.modified[0].changes.title).toEqual({ from: 'Old name', to: 'New name' });
  });
});

// ---------------------------------------------------------------------------
// Year-based YAML normalisation
// ---------------------------------------------------------------------------

describe('parseYamlToGoals — year-based format', () => {
  const yearBasedYaml = `
meta:
  name: "Test Year Stack"
  owner: "test@example.com"
  is_company: true
  exported_at: "2026-04-13T00:00:00Z"

high_hard_goal:
  title: "Hit $50M revenue"
  start_date: "2026-04-01"
  end_date: "2031-04-01"
  confidence: 8
  success_criteria:
    - "16 locations"
    - "38,000 subscribers"

year_1:
  label: "April 2026 — March 2027"
  start_date: "2026-04-01"
  end_date: "2027-03-31"
  strategic_goals:
    - id: SG1
      title: "Max Location 1"
      why: "Prove the model at capacity before expanding."
      deliverables:
        - "Scale to 60% utilization"
        - "Hire 6 more staff"
    - id: SG2
      title: "Build Subscription Engine"
      why: "Recurring revenue is the model."
      deliverables:
        - "Launch membership tiers"
  yearly_kpis:
    - { name: "Revenue", target: "$686K" }
    - { name: "Utilization", target: "35%" }
  monthly_goals:
    - month: "April 2026"
      key_goal: "Baseline month"
      strategic_goals: [SG1]
      funnel:
        leads: 250
        bookings: 70
        new_customers: 18
        chair_utilization: "12%"
      revenue:
        total: "$17,535"
        subscription_revenue: "$735"
    - month: "May 2026"
      key_goal: "Add Google Ads"
      strategic_goals: [SG2]

year_2:
  label: "April 2027 — March 2028"
  start_date: "2027-04-01"
  end_date: "2028-03-31"
  strategic_goals:
    - title: "Replicate to 2 More Locations"
      why: "Same city reduces complexity."
      deliverables:
        - "Location 2 opens"
        - "Location 3 opens"
  yearly_kpis:
    - { name: "Locations", target: 3 }
`;

  it('produces HHG with strategic goals from year blocks', () => {
    const { goals, meta } = parseYamlToGoals(yearBasedYaml);
    expect(goals).toHaveLength(1);
    expect(goals[0].level).toBe('HIGH_HARD');
    expect(goals[0].title).toBe('Hit $50M revenue');
    expect(meta.name).toBe('Test Year Stack');

    // Year 1 has 2 SGs + Year 2 has 1 SG = 3 total
    const strategicGoals = goals[0].children!;
    expect(strategicGoals).toHaveLength(3);
  });

  it('maps why to description on strategic goals', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const sg1 = goals[0].children![0];
    expect(sg1.description).toBe('Prove the model at capacity before expanding.');
  });

  it('converts deliverables to tasks', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const sg1 = goals[0].children![0];
    expect(sg1.tasks).toHaveLength(2);
    expect(sg1.tasks![0].title).toBe('Scale to 60% utilization');
    expect(sg1.tasks![0].status).toBe('TODO');
    expect(sg1.tasks![0].priority).toBe('MEDIUM');
    expect(sg1.tasks![1].title).toBe('Hire 6 more staff');
  });

  it('resolves monthly goals to correct strategic parent via back-references', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const sg1 = goals[0].children![0]; // SG1
    const sg2 = goals[0].children![1]; // SG2

    // April refs SG1, May refs SG2
    expect(sg1.children).toHaveLength(1);
    expect(sg1.children![0].title).toContain('April 2026');
    expect(sg2.children).toHaveLength(1);
    expect(sg2.children![0].title).toContain('May 2026');
  });

  it('folds business context into monthly goal description', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const april = goals[0].children![0].children![0];
    expect(april.description).toContain('Baseline month');
    expect(april.description).toContain('250 leads');
    expect(april.description).toContain('$17,535');
  });

  it('parses month strings into start_date and end_date', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const april = goals[0].children![0].children![0];
    expect(april.startDate).toBe('2026-04-01');
    expect(april.endDate).toBe('2026-04-30');
  });

  it('sets strategic goal dates from parent year block', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const sg1 = goals[0].children![0];
    expect(sg1.startDate).toBe('2026-04-01');
    expect(sg1.endDate).toBe('2027-03-31');
  });

  it('folds HHG extra fields into description', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    expect(goals[0].description).toContain('Confidence: 8/10');
    expect(goals[0].description).toContain('16 locations');
    expect(goals[0].description).toContain('38,000 subscribers');
  });

  it('attaches yearly_kpis to first strategic goal of each year', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const sg1Kpis = goals[0].children![0].kpis!;
    expect(sg1Kpis.some((k) => k.name === 'Revenue')).toBe(true);
    expect(sg1Kpis.some((k) => k.name === 'Utilization')).toBe(true);

    // Year 2 SG
    const y2sg = goals[0].children![2];
    expect(y2sg.kpis!.some((k) => k.name === 'Locations' && k.target === 3)).toBe(true);
  });

  it('parses string KPI targets correctly', () => {
    const { goals } = parseYamlToGoals(yearBasedYaml);
    const kpis = goals[0].children![0].kpis!;
    const revenue = kpis.find((k) => k.name === 'Revenue')!;
    expect(revenue.target).toBe(686_000);

    const util = kpis.find((k) => k.name === 'Utilization')!;
    expect(util.target).toBe(35);
    expect(util.unit).toBe('%');
  });

  it('does not affect canonical format parsing (regression)', () => {
    const canonicalYaml = exportGoalsToYaml(sampleTree, sampleMeta);
    const { goals } = parseYamlToGoals(canonicalYaml);
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe('Reach $1M ARR');
    expect(goals[0].children).toHaveLength(1);
    expect(goals[0].children![0].title).toBe('Double pipeline');
  });
});
