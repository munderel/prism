import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, requireTaskAccess } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateWorkBlockSchema } from '@/lib/schemas';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  getGoogleSyncInfo,
} from '@/lib/calendar';

const blockInclude = {
  task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
  clearGoals: { orderBy: { sortOrder: 'asc' as const } },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const block = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    include: blockInclude,
  });
  if (!block) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(block, NO_STORE);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const parsed = await parseBody(request, updateWorkBlockSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, taskId: true, start: true, end: true, mainObjective: true, calendarEventId: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  // Re-verify task access — the task may have been reassigned since the block
  // was created, in which case the current user should no longer mutate it.
  const taskAccess = await requireTaskAccess(existing.taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  // Guard against updates that would leave end <= start on the row as a whole.
  // The zod schema checks the pair when both are provided; here we re-check
  // against the stored values when only one side of the pair is updated.
  const resolvedStart = body.start !== undefined ? new Date(body.start) : existing.start;
  const resolvedEnd = body.end !== undefined ? new Date(body.end) : existing.end;
  if (resolvedEnd <= resolvedStart) {
    return Response.json({ error: 'end must be after start' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.start !== undefined) data.start = resolvedStart;
  if (body.end !== undefined) data.end = resolvedEnd;
  if (body.mainObjective !== undefined) data.mainObjective = body.mainObjective;
  if (body.completionStatus !== undefined) {
    data.completionStatus = body.completionStatus;
    if (body.completionStatus !== 'PENDING') data.reviewedAt = new Date();
  }
  if (body.actualMinutes !== undefined) data.actualMinutes = body.actualMinutes;
  if (body.notes !== undefined) data.notes = body.notes;

  const block = await prisma.$transaction(async (tx) => {
    const updated = await tx.workBlock.update({ where: { id }, data });
    if (body.subGoals !== undefined) {
      await tx.clearGoal.deleteMany({ where: { workBlockId: id } });
      if (body.subGoals.length > 0) {
        await tx.clearGoal.createMany({
          data: body.subGoals.map((text, idx) => ({
            taskId: updated.taskId,
            workBlockId: id,
            text,
            sortOrder: idx,
          })),
        });
      }
    }
    return tx.workBlock.findUnique({
      where: { id },
      include: blockInclude,
    });
  });

  // Google Calendar sync — fire-and-forget. Update the linked event when
  // calendar-relevant fields (start/end/mainObjective) changed; create one if
  // the block was made before sync was wired up so older blocks self-heal.
  const calendarFieldsChanged =
    body.start !== undefined || body.end !== undefined || body.mainObjective !== undefined;
  if (calendarFieldsChanged) {
    const taskTitle = block?.task?.title ?? 'Work block';
    const effectiveObjective = block?.mainObjective ?? existing.mainObjective;
    const effectiveStart = resolvedStart;
    const effectiveEnd = resolvedEnd;
    const summary = `${taskTitle}: ${effectiveObjective}`;
    const syncToGcal = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
      if (!hasGoogle) {
        return { ok: false, error: 'Google Calendar is not connected. Reconnect in Settings.' };
      }
      try {
        if (existing.calendarEventId) {
          await updateGoogleEvent(auth.userId, existing.calendarEventId, {
            summary,
            description: effectiveObjective,
            start: effectiveStart.toISOString(),
            end: effectiveEnd.toISOString(),
          }, targetCalendarId);
          await prisma.workBlock.update({
            where: { id },
            data: { syncedAt: new Date(), syncError: null },
          });
          return { ok: true };
        }
        const user = await prisma.user.findUnique({
          where: { id: auth.userId },
          select: { timezone: true },
        });
        const tz = user?.timezone ?? 'America/New_York';
        const gcalEvent = await createGoogleEvent(auth.userId, {
          summary,
          description: effectiveObjective,
          start: effectiveStart.toISOString(),
          end: effectiveEnd.toISOString(),
          timeZone: tz,
        }, targetCalendarId);
        if (!gcalEvent?.id) {
          return { ok: false, error: 'Google did not return an event id. Check calendar permissions.' };
        }
        await prisma.workBlock.update({
          where: { id },
          data: { calendarEventId: gcalEvent.id, syncedAt: new Date(), syncError: null },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Google Calendar error';
        return { ok: false, error: message };
      }
    };
    syncToGcal().then(async (result) => {
      if (!result.ok) {
        console.warn('[work-blocks] Google Calendar sync failed:', result.error);
        await prisma.workBlock.update({
          where: { id },
          data: { syncError: result.error, syncedAt: null },
        }).catch((err) => console.error('[work-blocks] failed to persist syncError', err));
      }
    }).catch((err) => console.warn('[work-blocks] Google Calendar sync threw:', err));
  }

  return Response.json(block, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id } = await params;

  const existing = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, taskId: true, calendarEventId: true },
  });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  // Re-verify task access before removing.
  const taskAccess = await requireTaskAccess(existing.taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  if (existing.calendarEventId) {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
    if (hasGoogle) {
      await deleteGoogleEvent(auth.userId, existing.calendarEventId, targetCalendarId).catch((err) => {
        console.warn('[work-blocks] Failed to delete GCal event on work-block delete:', err);
      });
    }
  }

  await prisma.workBlock.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
