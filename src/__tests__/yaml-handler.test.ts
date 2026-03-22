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
});
