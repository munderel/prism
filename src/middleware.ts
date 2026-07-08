import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyRequestOrigin } from '@/lib/origin-check';

const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Immediately redirect locked-out users (set when invite is revoked)
  if (token.isLockedOut) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'access_revoked');
    return NextResponse.redirect(loginUrl);
  }

  // CSRF defense-in-depth: unsafe API mutations must come from our own origin.
  // Routes excluded from the matcher below (api/auth, api/cron, api/health,
  // api/invitations, api/notifications/public-key) are not covered here;
  // POST /api/invitations enforces the same check inline in its handler.
  if (
    UNSAFE_METHODS.has(request.method) &&
    request.nextUrl.pathname.startsWith('/api/') &&
    !verifyRequestOrigin(request)
  ) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|accept-invite|api/auth|api/cron|api/health|api/invitations|api/notifications/public-key|sw\\.js|_next/static|_next/image|favicon\\.ico).*)'],
};
