/**
 * Extract @mentions from text, excluding email-like patterns.
 * Returns deduplicated array of mention names (lowercase).
 */
export function extractMentions(text: string): string[] {
  const regex = /(?:^|(?<=\s))@([\w.]+)/g;
  const mentions = new Set<string>();
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
      if (u.name && u.name.toLowerCase().startsWith(lower)) return true;
      if (u.name && lower.includes('.')) {
        if (u.name.toLowerCase().replace(/\s+/g, '.') === lower) return true;
      }
      if (u.email && u.email.split('@')[0].toLowerCase() === lower) return true;
      return false;
    });

    if (user) {
      resolved.push({ id: user.id, name: user.name ?? 'Unknown' });
    }
  }

  return resolved;
}
