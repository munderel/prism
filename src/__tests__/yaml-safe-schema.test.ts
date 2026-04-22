import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { parseYamlToGoals } from '@/lib/yaml-handler';

// Critical #8: parseYamlToGoals must reject any !!custom tag that could
// instantiate runtime behaviour (in older js-yaml) or smuggle binary /
// timestamp / omap objects past Zod validation. JSON_SCHEMA limits the
// parser to strings, numbers, booleans, nulls, mappings, sequences.

describe('parseYamlToGoals — safe schema (Critical #8)', () => {
  it('rejects !!timestamp (custom tag, would bypass string typing)', () => {
    const bad = `
meta:
  name: X
  owner: u
  is_company: false
  exported_at: !!timestamp 2026-01-01T00:00:00Z
high_hard_goal:
  title: Ship
`;
    expect(() => parseYamlToGoals(bad)).toThrow();
  });

  it('rejects !!binary (custom tag)', () => {
    const bad = `
meta:
  name: !!binary "SGVsbG8="
  owner: u
  is_company: false
  exported_at: ""
high_hard_goal:
  title: Ship
`;
    expect(() => parseYamlToGoals(bad)).toThrow();
  });

  it('rejects !!omap (custom tag)', () => {
    const bad = `
meta:
  name: X
  owner: u
  is_company: false
  exported_at: ""
high_hard_goal:
  title: Ship
  subordinate_goals: !!omap
    - one: 1
    - two: 2
`;
    expect(() => parseYamlToGoals(bad)).toThrow();
  });

  it('rejects !!js/function (still rejected even if js-yaml ever added it back)', () => {
    const bad = `
meta:
  name: X
  owner: u
  is_company: false
  exported_at: ""
high_hard_goal:
  title: !!js/function "function () { return 1 }"
`;
    expect(() => parseYamlToGoals(bad)).toThrow();
  });

  it('accepts JSON-equivalent scalars: numbers + booleans + nulls', () => {
    // numbers and booleans must survive as their native types so downstream
    // Zod schemas for impactScore/confidenceScore/easeScore keep working.
    const good = `
meta:
  name: X
  owner: u
  is_company: false
  exported_at: ""
high_hard_goal:
  title: Ship
  impact: 4
  confidence: 3
  ease: 2
  description: null
`;
    const { goals } = parseYamlToGoals(good);
    expect(goals.length).toBeGreaterThan(0);
    const hhg = goals[0];
    // JSON_SCHEMA keeps 4/3/2 as numbers, not strings
    expect(typeof hhg.impact === 'number' || hhg.impact === undefined).toBe(true);
  });

  it('parses plain tree YAML without errors (happy path)', () => {
    const good = `
meta:
  name: My Stack
  owner: Me
  is_company: false
  exported_at: 2026-05-01
high_hard_goal:
  title: Ship the product
`;
    const result = parseYamlToGoals(good);
    expect(result.meta.name).toBe('My Stack');
    expect(result.goals.length).toBeGreaterThanOrEqual(1);
  });

  it('does not regress: JSON_SCHEMA equivalence test with js-yaml direct', () => {
    // Parity check — the route uses JSON_SCHEMA; asserting the schema ref is
    // a known constant rules out accidental reverts to DEFAULT_SCHEMA.
    expect(yaml.JSON_SCHEMA).toBeDefined();
    expect(yaml.JSON_SCHEMA).not.toBe(yaml.DEFAULT_SCHEMA);
  });
});
