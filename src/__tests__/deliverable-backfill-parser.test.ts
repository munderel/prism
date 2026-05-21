import { describe, it, expect } from 'vitest';
import { parseDeliverableBullets } from '@/lib/deliverable-backfill-parser';

/**
 * These tests document the parsing rules of the SQL migration at
 * prisma/migrations/20260521000000_backfill_deliverable_items_from_description/migration.sql.
 *
 * The TypeScript helper exists for documentation only — it is not imported by
 * runtime code. The migration uses Postgres regex; this mirrors it so the
 * heuristics are reviewable and testable.
 */
describe('parseDeliverableBullets (defensive backfill parser)', () => {
  it('returns no items for a prose paragraph with no bullets', () => {
    const description =
      'This is a regular paragraph of prose. It has no bullets at all.\n' +
      'Just two normal lines of writing about the goal.';
    expect(parseDeliverableBullets(description)).toEqual([]);
  });

  it('returns no items for a single-bullet line (2+ required)', () => {
    // A single "- " line could easily be prose; the heuristic discards it.
    const description = '- only one bullet here\nnot a list, just a sentence.';
    expect(parseDeliverableBullets(description)).toEqual([]);
  });

  it('parses three markdown bullets into three items', () => {
    const description = '- first thing\n- second thing\n- third thing';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'first thing', isDone: false },
      { text: 'second thing', isDone: false },
      { text: 'third thing', isDone: false },
    ]);
  });

  it('parses a mixed list of "-", "*", "[x]", and "[ ]" bullets', () => {
    const description =
      '- alpha\n' + '* beta\n' + '[x] gamma\n' + '[ ] delta\n' + '• epsilon';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'alpha', isDone: false },
      { text: 'beta', isDone: false },
      { text: 'gamma', isDone: true },
      { text: 'delta', isDone: false },
      { text: 'epsilon', isDone: false },
    ]);
  });

  it('parses a numbered list', () => {
    const description = '1. write the spec\n2. code the feature\n3. ship it';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'write the spec', isDone: false },
      { text: 'code the feature', isDone: false },
      { text: 'ship it', isDone: false },
    ]);
  });

  it('parses indented bullets and strips the prefix correctly', () => {
    const description = '   - indented one\n\t- tab-indented two';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'indented one', isDone: false },
      { text: 'tab-indented two', isDone: false },
    ]);
  });

  it('rejects lines that have an empty body after the bullet prefix', () => {
    // "- " with nothing after fails the `\S` anchor; only the two real bullets count.
    const description = '- \n- real item one\n- real item two\n- ';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'real item one', isDone: false },
      { text: 'real item two', isDone: false },
    ]);
  });

  it('treats "[X]" (uppercase) as done as well as "[x]"', () => {
    const description = '[X] uppercase done\n[x] lowercase done';
    expect(parseDeliverableBullets(description)).toEqual([
      { text: 'uppercase done', isDone: true },
      { text: 'lowercase done', isDone: true },
    ]);
  });

  it('returns no items for null / empty descriptions', () => {
    expect(parseDeliverableBullets(null)).toEqual([]);
    expect(parseDeliverableBullets(undefined)).toEqual([]);
    expect(parseDeliverableBullets('')).toEqual([]);
  });
});
