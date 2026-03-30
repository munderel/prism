const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
];

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fe80:/i,
];

/**
 * Validate a file URL for storage.
 * Enforces HTTPS-only, blocks private/internal IPs, limits length.
 * Returns { url } on success, { error } on failure.
 */
export function validateFileUrl(
  raw: unknown
): { url: string; error?: never } | { url?: never; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { error: 'fileUrl is required' };
  }

  if (raw.length > 2048) {
    return { error: 'fileUrl must be under 2048 characters' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'fileUrl must be a valid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'fileUrl must use HTTPS' };
  }

  if (BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    return { error: 'fileUrl points to a blocked host' };
  }

  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(parsed.hostname)) {
      return { error: 'fileUrl must not point to a private/internal IP' };
    }
  }

  return { url: raw };
}
