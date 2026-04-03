import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';

/**
 * DEPRECATED: Process tasks are now managed via BASIC/ADVANCED modes.
 * - BASIC mode: calendar events + completion tracking (no tasks created)
 * - ADVANCED mode: tasks pre-created on process save, replenished lazily on GET /api/tasks
 *
 * This route is kept as a no-op for backwards compatibility.
 */
export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    message: 'Deprecated. Process tasks are now managed via BASIC/ADVANCED modes.',
    processed: 0,
  });
}
