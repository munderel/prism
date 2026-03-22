/**
 * Extract @mentions from text, excluding email-like patterns.
 * Returns deduplicated array of mention names (lowercase).
 */
export function extractMentions(text: string): string[] {
  const mentions: Set<string> = new Set();
  // Match @word at start of string or after whitespace, but not preceded by non-whitespace (emails)
  const regex = /(?:^|(?<=\s))@([\w.]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    mentions.add(match[1].toLowerCase());
  }

  return Array.from(mentions);
}

interface UserLike {
  id: string;
  name: string | null;
  email: string | null;
}

interface ResolvedMention {
  id: string;
  name: string;
}

/**
 * Resolve mention names against a list of users.
 * Matches by: first name, full name (dot-separated), or email prefix.
 */
export function resolveMentions(mentionNames: string[], users: UserLike[]): ResolvedMention[] {
  const resolved: ResolvedMention[] = [];

  for (const mention of mentionNames) {
    const lower = mention.toLowerCase();

    const user = users.find((u) => {
      // Match first name
      if (u.name && u.name.toLowerCase().startsWith(lower)) return true;
      // Match first.last format against full name
      if (u.name && lower.includes('.')) {
        const normalized = u.name.toLowerCase().replace(/\s+/g, '.');
        if (normalized === lower) return true;
      }
      // Match email prefix
      if (u.email) {
        const emailPrefix = u.email.split('@')[0].toLowerCase();
        if (emailPrefix === lower) return true;
      }
      return false;
    });

    if (user) {
      resolved.push({ id: user.id, name: user.name ?? 'Unknown' });
    }
  }

  return resolved;
}
