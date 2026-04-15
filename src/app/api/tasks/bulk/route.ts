import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { deleteGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';

/**
 * POST /api/tasks/bulk
 *
 * Bulk task actions. Currently supports:
 * - { action: 'delete', taskIds: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { action, taskIds } = body;

  if (action !== 'delete' || !Array.isArray(taskIds) || taskIds.length === 0) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (taskIds.length > 100) {
    return Response.json({ error: 'Too many tasks (max 100)' }, { status: 400 });
  }

  // Verify ownership
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, ownerId: true, calendarEventId: true },
  });

  const ownedIds = tasks
    .filter((t) => t.ownerId === auth.userId || auth.session.user.isAdmin)
    .map((t) => t.id);

  if (ownedIds.length === 0) {
    return Response.json({ error: 'No tasks found or not authorized' }, { status: 403 });
  }

  // Delete Google Calendar events (fire and forget)
  const gcalTasks = tasks.filter((t) => t.calendarEventId && ownedIds.includes(t.id));
  if (gcalTasks.length > 0) {
    getGoogleSyncInfo(auth.userId).then(({ calendarId }) => {
      for (const t of gcalTasks) {
        deleteGoogleEvent(auth.userId, t.calendarEventId!, calendarId).catch(() => {});
      }
    }).catch(() => {});
  }

  // Delete tasks in transaction
  await prisma.task.deleteMany({
    where: { id: { in: ownedIds } },
  });

  return Response.json({ deleted: ownedIds.length });
}
