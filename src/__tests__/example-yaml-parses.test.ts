import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseYamlToGoals } from '@/lib/yaml-handler';

describe('public/example-goal-stack-full.yaml', () => {
  const yamlContent = readFileSync(
    join(process.cwd(), 'public', 'example-goal-stack-full.yaml'),
    'utf8'
  );

  it('parses through parseYamlToGoals without throwing', () => {
    expect(() => parseYamlToGoals(yamlContent)).not.toThrow();
  });

  it('produces a single HIGH_HARD root with the expected hierarchy', () => {
    const { goals, meta } = parseYamlToGoals(yamlContent);

    expect(meta.name).toBe('Example Full Stack');
    expect(meta.is_company).toBe(false);

    expect(goals).toHaveLength(1);
    const hhg = goals[0];
    expect(hhg.level).toBe('HIGH_HARD');
    expect(hhg.children).toHaveLength(4);

    const [sg1, sg2, sg3, sg4] = hhg.children!;
    expect(sg1.status).toBe('IN_PROGRESS');
    expect(sg2.status).toBe('COMPLETED');
    expect(sg3.status).toBe('ABANDONED');
    expect(sg4.status).toBe('NOT_STARTED');
  });

  it('exercises every task_type, task status, and priority', () => {
    const { goals } = parseYamlToGoals(yamlContent);
    const sg1 = goals[0].children![0];
    const mg = sg1.children![0];
    const wg = mg.children![0];
    const tasks = wg.tasks!;

    const taskTypes = new Set(tasks.map((t) => t.taskType ?? 'IMPROVE'));
    expect(taskTypes).toEqual(new Set(['IMPROVE', 'REACT', 'MAINTENANCE', 'REVIEW']));

    const statuses = new Set(tasks.map((t) => t.status));
    expect(statuses.has('TODO')).toBe(true);
    expect(statuses.has('IN_PROGRESS')).toBe(true);
    expect(statuses.has('DONE')).toBe(true);
    expect(statuses.has('DROPPED')).toBe(true);

    const priorities = new Set(tasks.map((t) => t.priority));
    expect(priorities).toEqual(new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']));
  });

  it('includes a binary KPI with completed_at and a linked weekly→monthly KPI', () => {
    const { goals } = parseYamlToGoals(yamlContent);
    const sg1 = goals[0].children![0];

    const mvpKpi = sg1.kpis?.find((k) => k.name === 'MVP shipped');
    expect(mvpKpi?.type).toBe('BINARY');
    expect(mvpKpi?.complete).toBe(true);
    expect(mvpKpi?.completed_at).toBe('2026-03-14T00:00:00Z');

    const mg = sg1.children![0];
    const wg = mg.children![0];
    const linkedKpi = wg.kpis?.find((k) => k.linked_to);
    expect(linkedKpi?.linked_to).toBe('Monthly new teams');
  });

  it('includes DAILY children under the WEEKLY goal with no tasks', () => {
    const { goals } = parseYamlToGoals(yamlContent);
    const wg = goals[0].children![0].children![0].children![0];
    expect(wg.level).toBe('WEEKLY');
    expect(wg.children?.length).toBeGreaterThanOrEqual(2);
    for (const daily of wg.children!) {
      expect(daily.level).toBe('DAILY');
      expect(daily.tasks ?? []).toHaveLength(0);
    }
  });
});
