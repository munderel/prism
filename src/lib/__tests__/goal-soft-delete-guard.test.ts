import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Static guard: Goal is the only soft-deleted model (schema `deletedAt`), so
 * every `prisma.goal.findMany(...)` that reads live goals must carry either the
 * shared `ACTIVE_GOAL_WHERE` constant or an explicit `deletedAt` token in its
 * argument text. A missed filter silently resurrects trashed goals into lists,
 * reports, and KPI scope — this test makes that regression loud at CI time
 * without changing any runtime behavior.
 *
 * If you add a call site that INTENTIONALLY reads deleted goals (a restore /
 * trash flow), add its repo-relative path to ALLOWLIST with a comment.
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Repo-relative paths (posix-style) allowed to omit the active-goal filter
// because they intentionally read deleted rows. Empty today — no goal
// findMany currently reads the trash — but kept as the documented escape hatch.
const ALLOWLIST: readonly string[] = [
  // e.g. 'src/app/api/goals/trash/route.ts',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, acc);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Given source text and the index just after `prisma.goal.findMany(`, return
 * the argument substring up to (and including) the matching closing paren,
 * tracking string/paren nesting so we don't stop early on nested `()`.
 */
function extractCallArgs(source: string, openParenIdx: number): string {
  let depth = 0;
  let i = openParenIdx;
  let inStr: string | null = null;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(openParenIdx, i + 1);
    }
  }
  return source.slice(openParenIdx); // unbalanced — return the rest
}

function findFindManyCalls(source: string): string[] {
  const calls: string[] = [];
  const needle = 'prisma.goal.findMany';
  let from = 0;
  for (;;) {
    const idx = source.indexOf(needle, from);
    if (idx === -1) break;
    const openIdx = source.indexOf('(', idx + needle.length);
    if (openIdx === -1) break;
    calls.push(extractCallArgs(source, openIdx));
    from = openIdx + 1;
  }
  return calls;
}

describe('soft-delete guard: prisma.goal.findMany filters deleted rows', () => {
  const files = walk(SRC_ROOT);

  it('scans a non-trivial set of source files', () => {
    // Sanity: ensure the walk found real source (guards against a broken path
    // silently making the guard vacuously pass).
    expect(files.length).toBeGreaterThan(50);
  });

  it('every prisma.goal.findMany carries ACTIVE_GOAL_WHERE or an explicit deletedAt', () => {
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(process.cwd(), file).split(sep).join('/');
      if (ALLOWLIST.includes(rel)) continue;

      const source = readFileSync(file, 'utf8');
      const calls = findFindManyCalls(source);
      for (const argText of calls) {
        if (
          !argText.includes('ACTIVE_GOAL_WHERE') &&
          !argText.includes('deletedAt')
        ) {
          violations.push(rel);
        }
      }
    }

    expect(
      violations,
      `prisma.goal.findMany without a soft-delete filter (add ACTIVE_GOAL_WHERE, or allow-list a real trash read):\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
