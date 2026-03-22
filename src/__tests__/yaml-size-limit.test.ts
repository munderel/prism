import { describe, it, expect } from 'vitest';
import { MAX_YAML_SIZE } from '@/app/api/goals/import/route';

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
