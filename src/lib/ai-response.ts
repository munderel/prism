import type { ZodSchema } from 'zod';
import { AIError } from './openrouter';

// Untyped `chatJSON<T>` assertions let any shape the model returns flow into
// application logic (suggested tasks, decomposed goals, …). Wrap model output
// in `parseAIJSON(raw, schema)` so invalid shapes fail loudly at the trust
// boundary instead of surfacing as runtime bugs in consumers.

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * Strips an optional ```json fenced block, JSON.parses the remaining text,
 * and validates against `schema`. Returns the validated typed value, or
 * throws an `AIError('PARSE_ERROR')` whose message includes the Zod
 * failure. Retryable at the call site — models sometimes return shape-valid
 * JSON on a second attempt.
 */
export function parseAIJSON<T>(raw: string, schema: ZodSchema<T>): T {
  let content = raw.trim();
  const match = content.match(FENCE_RE);
  if (match) content = match[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new AIError(
      `Failed to parse AI response as JSON: ${err instanceof Error ? err.message : String(err)}`,
      'PARSE_ERROR',
      true,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new AIError(
      `AI response failed schema validation: ${issues}`,
      'PARSE_ERROR',
      true,
    );
  }
  return result.data;
}
