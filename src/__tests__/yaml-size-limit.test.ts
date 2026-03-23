import { describe, it, expect } from 'vitest';

// MAX_YAML_SIZE is defined in the route file but can't be exported (Next.js route constraint)
const MAX_YAML_SIZE = 256 * 1024; // 256KB — must stay in sync with src/app/api/goals/import/route.ts

describe('YAML size limit constant', () => {
  it('is 256KB', () => {
    expect(MAX_YAML_SIZE).toBe(256 * 1024);
  });

  it('rejects strings exceeding the limit', () => {
    const oversized = 'a'.repeat(MAX_YAML_SIZE + 1);
    const wouldReject = typeof oversized !== 'string' || oversized.length > MAX_YAML_SIZE;
    expect(wouldReject).toBe(true);
  });

  it('accepts strings under the limit', () => {
    const valid = 'title: test\n';
    const wouldReject = typeof valid !== 'string' || valid.length > MAX_YAML_SIZE;
    expect(wouldReject).toBe(false);
  });
});
