import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Implement in Phase 9
  return Response.json({ ok: true, message: 'Review nag placeholder' });
}
