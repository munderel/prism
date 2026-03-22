import { describe, it, expect } from 'vitest';
import { extractMentions, resolveMentions } from '../lib/mention-parser';

describe('extractMentions', () => {
  it('extracts a single mention', () => {
    expect(extractMentions('Hey @alice check this')).toEqual(['alice']);
  });

  it('extracts multiple mentions', () => {
    expect(extractMentions('@alice and @bob please review')).toEqual(['alice', 'bob']);
  });

  it('deduplicates mentions', () => {
    expect(extractMentions('@alice said @alice should do it')).toEqual(['alice']);
  });

  it('handles @first.last format', () => {
    expect(extractMentions('cc @john.doe')).toEqual(['john.doe']);
  });

  it('excludes email-like patterns', () => {
    expect(extractMentions('email alice@example.com please')).toEqual([]);
  });

  it('returns empty for no mentions', () => {
    expect(extractMentions('no mentions here')).toEqual([]);
  });

  it('handles mention at start of string', () => {
    expect(extractMentions('@alice do this')).toEqual(['alice']);
  });
});

describe('resolveMentions', () => {
  const users = [
    { id: 'u1', name: 'Alice Smith', email: 'alice@example.com' },
    { id: 'u2', name: 'Bob Jones', email: 'bob@example.com' },
    { id: 'u3', name: 'John Doe', email: 'john.doe@example.com' },
  ];

  it('resolves by name (case-insensitive)', () => {
    const result = resolveMentions(['alice'], users);
    expect(result).toEqual([{ id: 'u1', name: 'Alice Smith' }]);
  });

  it('resolves by first.last format', () => {
    const result = resolveMentions(['john.doe'], users);
    expect(result).toEqual([{ id: 'u3', name: 'John Doe' }]);
  });

  it('resolves multiple mentions', () => {
    const result = resolveMentions(['alice', 'bob'], users);
    expect(result).toHaveLength(2);
  });

  it('skips unresolved mentions', () => {
    const result = resolveMentions(['unknown'], users);
    expect(result).toEqual([]);
  });
});
