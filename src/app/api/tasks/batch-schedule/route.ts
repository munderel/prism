import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

interface BatchUpdate {
  id: string;
  timeBlockStart: string;
  timeBlockEnd: string;
  isAutoScheduled?: boolean;
  isPinned?: boolean;
}

function isValidISODate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: { updates?: BatchUpdate[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { updates } = body;

  // Validate: updates must be a non-empty array
  if (!Array.isArray(updates) || updates.length === 0) {
    return Response.json(
      { error: 'updates must be a non-empty array' },
      { status: 400 }
    );
  }

  // Validate each entry
  for (const entry of updates) {
    if (!entry.id || typeof entry.id !== 'string') {
      return Response.json(
        { error: 'Each update must have a valid id' },
        { status: 400 }
      );
    }
    if (!entry.timeBlockStart || !isValidISODate(entry.timeBlockStart)) {
      return Response.json(
        { error: `Invalid or missing timeBlockStart for task ${entry.id}` },
        { status: 400 }
      );
    }
    if (!entry.timeBlockEnd || !isValidISODate(entry.timeBlockEnd)) {
      return Response.json(
        { error: `Invalid or missing timeBlockEnd for task ${entry.id}` },
        { status: 400 }
      );
    }
    if (new Date(entry.timeBlockEnd) <= new Date(entry.timeBlockStart)) {
      return Response.json(
        { error: `timeBlockEnd must be after timeBlockStart for task ${entry.id}` },
        { status: 400 }
      );
    }
  }

  const taskIds = updates.map((u) => u.id);

  // Fetch all tasks to verify they exist and check ownership
  const existingTasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, ownerId: true },
  });

  // Check that all task IDs were found
  const foundIds = new Set(existingTasks.map((t) => t.id));
  const missingIds = taskIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return Response.json(
      { error: `Tasks not found: ${missingIds.join(', ')}` },
      { status: 404 }
    );
  }

  // Verify ownership: non-admin users can only update their own tasks
  if (!auth.session.user.isAdmin) {
    const unauthorized = existingTasks.filter((t) => t.ownerId !== auth.userId);
    if (unauthorized.length > 0) {
      return Response.json(
        { error: 'Forbidden: you do not own all specified tasks' },
        { status: 403 }
      );
    }
  }

  // Build update map for quick lookup
  const updateMap = new Map(updates.map((u) => [u.id, u]));

  // Execute all updates atomically in a transaction
  const results = await prisma.$transaction(
    existingTasks.map((task) => {
      const update = updateMap.get(task.id)!;
      const start = new Date(update.timeBlockStart);
      const end = new Date(update.timeBlockEnd);

      // Sync dueDate to the date portion of timeBlockStart
      const dueDate = new Date(start);
      dueDate.setUTCHours(0, 0, 0, 0);

      return prisma.task.update({
        where: { id: task.id },
        data: {
          timeBlockStart: start,
          timeBlockEnd: end,
          isAutoScheduled: update.isAutoScheduled ?? false,
          isPinned: update.isPinned ?? false,
          dueDate,
        },
      });
    })
  );

  return Response.json({ updated: results.length });
}
