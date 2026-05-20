import { cacheHeaders } from '@/lib/api-helpers';

/**
 * GET /api/notifications/public-key
 * Returns the VAPID public key for client-side push subscription.
 * Public endpoint — no auth required (the key is not secret).
 */
export async function GET() {
  return Response.json(
    { key: process.env.VAPID_PUBLIC_KEY ?? '' },
    { headers: cacheHeaders(3600, 86400) }
  );
}
