import { describe, it, expect } from 'vitest';
import { updateAimInstanceSchema } from '@/lib/schemas';

// Regression: the PowerDownRitual client used to send { completed: true }.
// updateAimInstanceSchema only accepts `status`, so Zod silently stripped the
// unknown key, the server's `if (status !== undefined)` branch never fired,
// and per-aim streaks + the daily "all daily aims complete" streak never
// advanced. These tests fence both sides of the contract.
describe('updateAimInstanceSchema', () => {
  it('strips a { completed: true } payload to an empty object (legacy field name must not leak through)', () => {
    const result = updateAimInstanceSchema.safeParse({ completed: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('accepts { status: "COMPLETED" }', () => {
    const result = updateAimInstanceSchema.safeParse({ status: 'COMPLETED' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('COMPLETED');
    }
  });

  it('accepts { status: "SCHEDULED" } (uncompleting an aim)', () => {
    const result = updateAimInstanceSchema.safeParse({ status: 'SCHEDULED' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status values', () => {
    const result = updateAimInstanceSchema.safeParse({ status: 'DONE' });
    expect(result.success).toBe(false);
  });
});
