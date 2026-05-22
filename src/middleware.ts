import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|accept-invite|api/auth|api/cron|api/health|api/invitations|api/notifications/public-key|sw\\.js|_next/static|_next/image|favicon\\.ico).*)'],
};
