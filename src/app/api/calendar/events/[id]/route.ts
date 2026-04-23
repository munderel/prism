import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, updateCalendarEventSchema } from '@/lib/schemas';
import { deleteGoogleEvent, getGoogleEvent, updateGoogleEvent, classifyGoogleError, type GoogleErrorCode } from '@/lib/calendar';

// Map our internal error codes to HTTP statuses + user-facing toasts so the
// client can show a specific message instead of a generic "Failed to update".
function errorResponse(code: GoogleErrorCode, message: string) {
  const httpStatus =
    code === 'auth' ? 401
    : code === 'not_found' ? 404
    : code === 'rate_limited' ? 429
    : code === 'precondition_failed' ? 409
    : code === 'transient' ? 502
    : 500;
  const userMessage =
    code === 'auth' ? 'Reconnect Google Calendar to continue'
    : code === 'not_found' ? 'Event no longer exists in Google Calendar'
    : code === 'rate_limited' ? 'Google is rate-limiting us — try again in a moment'
    : code === 'precondition_failed' ? 'Event was changed in Google; please retry'
    : code === 'transient' ? 'Google Calendar is temporarily unreachable'
    : message || 'Failed to update Google Calendar event';
  return Response.json({ error: userMessage, code }, { status: httpStatus });
}

// Look up Prism rows that reference this Google event. Used both to enforce
// ownership on rows Prism manages and to mirror time updates into the local DB
// so the next calendar refetch is authoritative without waiting for Google's
// replication window.
//
// Returns:
//   { status: 'ok', linked }    — no linked rows OR caller owns every linked row
//   { status: 'forbidden' }     — a linked row exists and caller doesn't own it
async function resolveEventScope(
  userId: string,
  eventId: string,
  isAdmin: boolean,
): Promise<
  | { status: 'ok'; linked: {
      task: { id: string } | null;
      review: { id: string } | null;
      powerdown: { id: string } | null;
      meeting: { id: string } | null;
      aimInstance: { id: string } | null;
    } }
  | { status: 'forbidden' }
> {
  const [task, review, powerdown, meeting, aimInstance] = await Promise.all([
    prisma.task.findFirst({
      where: { calendarEventId: eventId },
      select: { id: true, ownerId: true, assigneeId: true },
    }),
    prisma.review.findFirst({
      where: { calendarEventId: eventId },
      select: { id: true, userId: true },
    }),
    prisma.powerdownSession.findFirst({
      where: { calendarEventId: eventId },
      select: { id: true, userId: true },
    }),
    prisma.meeting.findFirst({
      where: { calendarEventId: eventId },
      select: { id: true, createdById: true },
    }),
    prisma.aimInstance.findFirst({
      where: { calendarEventId: eventId },
      select: { id: true, userId: true },
    }),
  ]);

  const anyLinked = !!(task || review || powerdown || meeting || aimInstance);

  if (anyLinked && !isAdmin) {
    const owned =
      (task && (task.ownerId === userId || task.assigneeId === userId)) ||
      (review && review.userId === userId) ||
      (powerdown && powerdown.userId === userId) ||
      (meeting && meeting.createdById === userId) ||
      (aimInstance && aimInstance.userId === userId);
    if (!owned) return { status: 'forbidden' };
  }

  return {
    status: 'ok',
    linked: {
      task: task ? { id: task.id } : null,
      review: review ? { id: review.id } : null,
      powerdown: powerdown ? { id: powerdown.id } : null,
      meeting: meeting ? { id: meeting.id } : null,
      aimInstance: aimInstance ? { id: aimInstance.id } : null,
    },
  };
}

/**
 * DELETE /api/calendar/events/[id]?calendarId=primary
 * Delete a Google Calendar event by its GCal event ID.
 *
 * Access rule: Google's OAuth scope already gates which calendars the caller
 * can mutate. For events linked to Prism rows, we additionally require the
 * caller to own the linked row — otherwise a deletion would orphan another
 * user's Prism record.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: eventId } = await params;
  const scope = await resolveEventScope(auth.userId, eventId, auth.session.user.isAdmin);
  if (scope.status === 'forbidden') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const calendarId = new URL(request.url).searchParams.get('calendarId') || 'primary';

  let deleted: boolean;
  try {
    deleted = await deleteGoogleEvent(auth.userId, eventId, calendarId);
  } catch (err) {
    const info = classifyGoogleError(err);
    console.warn('[calendar] DELETE Google event threw', { eventId, calendarId, ...info });
    return errorResponse(info.code, info.message);
  }
  if (!deleted) {
    return errorResponse('unknown', 'Failed to delete Google Calendar event');
  }

  return Response.json({ ok: true });
}

/**
 * PATCH /api/calendar/events/[id]
 * Update a Google Calendar event's time (used for drag-to-reschedule).
 *
 * For events linked to a Prism row, the linked row's time-block fields are
 * mirrored in the same request so the next calendar refetch returns the new
 * time from Prism's DB regardless of Google's replication lag.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: eventId } = await params;
  const scope = await resolveEventScope(auth.userId, eventId, auth.session.user.isAdmin);
  if (scope.status === 'forbidden') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(request, updateCalendarEventSchema);
  if ('error' in parsed) return parsed.error;

  const { start, end, calendarId = 'primary' } = parsed.data;
  const startDate = new Date(start);
  const endDate = new Date(end);
  // Hoist out of the narrowed `auth` union so nested closures keep the type.
  const userId = auth.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = user?.timezone ?? 'UTC';

  // Fetch the event first to get its current etag. We'll send that via
  // If-Match so a concurrent edit in Google Calendar web doesn't silently
  // get clobbered by our PATCH. On a 412, we re-fetch + retry once, then
  // surface 409 to the client.
  let currentEtag: string | undefined;
  try {
    const current = await getGoogleEvent(userId, eventId, calendarId);
    currentEtag = current?.etag ?? undefined;
  } catch (err) {
    const info = classifyGoogleError(err);
    console.warn('[calendar] events.get before PATCH threw', { eventId, calendarId, ...info });
    return errorResponse(info.code, info.message);
  }

  async function patchWithEtag(ifMatch: string | undefined) {
    return updateGoogleEvent(
      userId,
      eventId,
      {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeZone,
      },
      calendarId,
      ifMatch ? { ifMatch } : undefined,
    );
  }

  let updated;
  try {
    updated = await patchWithEtag(currentEtag);
  } catch (err) {
    const info = classifyGoogleError(err);
    if (info.code === 'precondition_failed') {
      // Remote changed between our get and patch. Re-fetch fresh etag and
      // retry once. On second 412, surface 409 so the client can re-query
      // and present the latest state to the user.
      try {
        const fresh = await getGoogleEvent(userId, eventId, calendarId);
        updated = await patchWithEtag(fresh?.etag ?? undefined);
      } catch (retryErr) {
        const retryInfo = classifyGoogleError(retryErr);
        console.warn('[calendar] PATCH retry after 412 still failed', { eventId, calendarId, ...retryInfo });
        return errorResponse(
          retryInfo.code === 'precondition_failed' ? 'precondition_failed' : retryInfo.code,
          retryInfo.message,
        );
      }
    } else {
      console.warn('[calendar] PATCH Google event threw', { eventId, calendarId, ...info });
      return errorResponse(info.code, info.message);
    }
  }
  if (!updated) {
    // updateGoogleEvent returns null when Google says the event is gone.
    return errorResponse('not_found', 'Event no longer exists in Google Calendar');
  }

  // Mirror into the linked Prism row(s) so `/api/calendar` returns the new
  // time on the next refetch without waiting on Google's read-replica
  // replication window. Task / Review / PowerdownSession / AimInstance all
  // store `timeBlockStart` + `timeBlockEnd`; Meeting uses a different
  // cadence-based shape and is left to the existing sync path.
  const { linked } = scope;
  const rowUpdates: Promise<unknown>[] = [];
  if (linked.task) {
    rowUpdates.push(
      prisma.task.update({
        where: { id: linked.task.id },
        data: { timeBlockStart: startDate, timeBlockEnd: endDate },
      }),
    );
  }
  if (linked.review) {
    rowUpdates.push(
      prisma.review.update({
        where: { id: linked.review.id },
        data: { timeBlockStart: startDate, timeBlockEnd: endDate },
      }),
    );
  }
  if (linked.powerdown) {
    rowUpdates.push(
      prisma.powerdownSession.update({
        where: { id: linked.powerdown.id },
        data: { timeBlockStart: startDate, timeBlockEnd: endDate },
      }),
    );
  }
  if (linked.aimInstance) {
    rowUpdates.push(
      prisma.aimInstance.update({
        where: { id: linked.aimInstance.id },
        data: { timeBlockStart: startDate, timeBlockEnd: endDate },
      }),
    );
  }
  if (rowUpdates.length > 0) {
    try {
      await Promise.all(rowUpdates);
    } catch (err) {
      // Google has already moved; log and continue. The next /api/calendar/sync
      // run will reconcile the Prism row against Google's authoritative state.
      console.error('[calendar] mirror-to-prism failed after Google PATCH', { eventId, err });
    }
  }

  return Response.json({ ok: true });
}
