/**
 * Mirror of the SQL regex used in
 * `prisma/migrations/20260521000000_backfill_deliverable_items_from_description/migration.sql`.
 *
 * This module documents the parsing rules for the defensive DeliverableItem
 * backfill so the behavior is testable in TypeScript even though the actual
 * conversion happens inside Postgres at migration time. It is intentionally
 * not imported by application runtime code — it exists purely as executable
 * documentation. Keep it in lock-step with the SQL regex.
 *
 * Rules (see the migration SQL header for the authoritative description):
 *   - A description must contain 2 or more bullet-pattern lines before any
 *     items are emitted; single-bullet prose paragraphs are left alone.
 *   - Bullet patterns (leading whitespace ignored):
 *       `- `, `* `, `• `, `[ ]`, `[x]` / `[X]`, `1.`, `2.`, ...
 *   - The line must have non-whitespace content after the prefix.
 *   - `[x]` / `[X]` → `isDone = true`; everything else → `isDone = false`.
 */

export interface ParsedDeliverableItem {
  text: string;
  isDone: boolean;
}

// Matches a bullet-list line and requires non-whitespace content after the
// prefix. Mirrors:  ^\s*([-*•]|\[[ xX]\]|\d+\.)\s+\S   in the SQL migration.
const BULLET_LINE = /^\s*(?:[-*•]|\[[ xX]\]|\d+\.)\s+\S/;

// Used to strip the bullet prefix once a line is confirmed to be a bullet.
const BULLET_PREFIX = /^\s*(?:[-*•]|\[[ xX]\]|\d+\.)\s+/;

// Matches the `[x]` / `[X]` checkbox prefix specifically (case-insensitive).
const DONE_PREFIX = /^\s*\[x\]/i;

export function parseDeliverableBullets(
  description: string | null | undefined,
): ParsedDeliverableItem[] {
  if (!description) return [];

  const lines = description.split('\n');
  const matched: ParsedDeliverableItem[] = [];

  for (const line of lines) {
    if (!BULLET_LINE.test(line)) continue;
    const isDone = DONE_PREFIX.test(line);
    const text = line.replace(BULLET_PREFIX, '').trim();
    matched.push({ text, isDone });
  }

  // Defensive heuristic: require at least 2 bullet lines or emit nothing.
  if (matched.length < 2) return [];

  return matched;
}
