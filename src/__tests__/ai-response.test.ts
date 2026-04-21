import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseAIJSON } from '@/lib/ai-response';
import { AIError } from '@/lib/openrouter';

const taskSchema = z.object({
  title: z.string().min(1),
  estimateMinutes: z.number().int().positive(),
  tags: z.array(z.string()).max(10),
});

describe('parseAIJSON', () => {
  it('parses a clean JSON object and returns typed shape', () => {
    const raw = '{"title":"Write PR","estimateMinutes":15,"tags":["code","review"]}';
    const out = parseAIJSON(raw, taskSchema);
    expect(out.title).toBe('Write PR');
    expect(out.estimateMinutes).toBe(15);
    expect(out.tags).toEqual(['code', 'review']);
  });

  it('strips a ```json fenced block', () => {
    const raw = '```json\n{"title":"A","estimateMinutes":1,"tags":[]}\n```';
    const out = parseAIJSON(raw, taskSchema);
    expect(out.title).toBe('A');
  });

  it('strips an unlabeled ``` fenced block', () => {
    const raw = '```\n{"title":"B","estimateMinutes":2,"tags":[]}\n```';
    const out = parseAIJSON(raw, taskSchema);
    expect(out.title).toBe('B');
  });

  it('tolerates surrounding whitespace', () => {
    const raw = '   \n\n{"title":"C","estimateMinutes":3,"tags":[]}   ';
    expect(parseAIJSON(raw, taskSchema).title).toBe('C');
  });

  it('throws retryable AIError(PARSE_ERROR) on invalid JSON', () => {
    try {
      parseAIJSON('not json at all', taskSchema);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIError);
      expect((err as AIError).code).toBe('PARSE_ERROR');
      expect((err as AIError).retryable).toBe(true);
      expect((err as AIError).message).toMatch(/parse.*JSON/i);
    }
  });

  it('throws retryable AIError(PARSE_ERROR) on shape mismatch', () => {
    // Missing estimateMinutes
    const raw = '{"title":"X","tags":[]}';
    try {
      parseAIJSON(raw, taskSchema);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIError);
      expect((err as AIError).code).toBe('PARSE_ERROR');
      expect((err as AIError).retryable).toBe(true);
      expect((err as AIError).message).toMatch(/schema validation/i);
      expect((err as AIError).message).toMatch(/estimateMinutes/);
    }
  });

  it('includes the failing path for nested shape errors', () => {
    // estimateMinutes is negative (violates positive())
    const raw = '{"title":"X","estimateMinutes":-5,"tags":[]}';
    try {
      parseAIJSON(raw, taskSchema);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as AIError).message).toMatch(/estimateMinutes/);
    }
  });

  it('caps issue list at 3 items to keep messages bounded', () => {
    const tallSchema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
    });
    try {
      parseAIJSON('{}', tallSchema);
      expect.fail('should have thrown');
    } catch (err) {
      const msg = (err as AIError).message;
      // only 3 of the 5 missing fields should appear
      const hits = ['a', 'b', 'c', 'd', 'e'].filter((k) => msg.includes(k + ':'));
      expect(hits.length).toBe(3);
    }
  });
});
