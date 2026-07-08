/**
 * Same-origin (CSRF) validation for unsafe HTTP methods on API routes.
 *
 * Edge-safe and dependency-free: this module is imported by the edge
 * middleware, so it must NOT import prisma or any node-only modules.
 *
 * Policy:
 * - No `Origin` header (curl, server-to-server, cron) → allowed. Browsers
 *   always attach `Origin` to cross-origin unsafe requests, so its absence
 *   means the request is not a browser CSRF vector.
 * - `Origin` present → its host must match the request's own host
 *   (`x-forwarded-host` preferred over `host`, the same trusted-header
 *   pattern used by the invitations route) or `NEXTAUTH_URL`'s host.
 * - Malformed `Origin` (including the literal `"null"` sent by sandboxed
 *   iframes / data: URLs) → rejected.
 */
export function verifyRequestOrigin(request: Pick<Request, 'headers'>): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const requestHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (requestHost && originHost === requestHost) return true;

  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (nextAuthUrl) {
    try {
      if (originHost === new URL(nextAuthUrl).host) return true;
    } catch {
      // Unparseable NEXTAUTH_URL — fall through to reject.
    }
  }

  return false;
}
