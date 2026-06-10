import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, batchScheduleSchema } from '@/lib/schemas';
import { parseDateOnly } from '@/lib/date-utils';
import { toUserDayStamp } from '@/lib/user-timezone';

interface BatchUpdate {
  id: string;
  timeBlockStart: string;
  timeBlockEnd: string;
  isAutoScheduled?: boolean;
  isPinned?: boolean;
}

function isValidISODate(value: string): boolean {
  return !isNaN(new Date(value).getTime());
}

function validateEntry(entry: BatchUpdate): string | null {
  if (!entry.id || typeof entry.id !== 'string') {
    return 'Each update must have a valid id';
  }
  if (!entry.timeBlockStart || !isValidISODate(entry.timeBlockStart)) {
    return `Invalid or missing timeBlockStart for task ${entry.id}`;
  }
  if (!entry.timeBlockEnd || !isValidISODate(entry.timeBlockEnd)) {
    return `Invalid or missing timeBlockEnd for task ${entry.id}`;
  }
  if (new Date(entry.timeBlockEnd) <= new Date(entry.timeBlockStart)) {
    return `timeBlockEnd must be after timeBlockStart for task ${entry.id}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, batchScheduleSchema);
  if ('error' in parsed) return parsed.error;
  const { updates } = parsed.data;

  for (const entry of updates) {
    const validationError = validateEntry(entry);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
  }

  const taskIds = updates.map((u) => u.id);

  // Fetch all tasks to verify they exist and check ownership
  const existingTasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, ownerId: true, owner: { select: { timezone: true } } },
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

      // Sync dueDate to the block's LOCAL calendar day in the owner's timezone,
      // stored as a UTC-midnight date-only anchor (parseDateOnly) like the rest
      // of the app. setUTCHours(0,0,0,0) filed late-evening/early-morning blocks
      // on the wrong day for non-UTC users.
      const ownerTz = task.owner?.timezone ?? 'America/New_York';
      const dueDate = parseDateOnly(toUserDayStamp(start, ownerTz))!;

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
