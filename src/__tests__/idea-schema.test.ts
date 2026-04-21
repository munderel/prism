import { describe, it, expect } from 'vitest';
import { IdeaStatus } from '@prisma/client';
import { updateIdeaSchema } from '@/lib/schemas';

describe('updateIdeaSchema.status (Critical #19)', () => {
  it.each([
    [IdeaStatus.SUBMITTED],
    [IdeaStatus.UNDER_REVIEW],
    [IdeaStatus.APPROVED],
    [IdeaStatus.REJECTED],
    [IdeaStatus.CONVERTED],
    [IdeaStatus.ARCHIVED],
  ])('accepts enum value %s', (status) => {
    const result = updateIdeaSchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it.each([['BOGUS'], ['submitted'], ['archived '], ['APPROVE']])(
    'rejects non-enum string %s at the Zod layer (was silently accepted before)',
    (status) => {
      const result = updateIdeaSchema.safeParse({ status });
      expect(result.success).toBe(false);
    },
  );

  it('allows status to be omitted entirely (partial update)', () => {
    const result = updateIdeaSchema.safeParse({ title: 'only-title' });
    expect(result.success).toBe(true);
  });
});
