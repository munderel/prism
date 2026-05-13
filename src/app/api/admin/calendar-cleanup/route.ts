import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import {
  deleteGoogleEvent,
  getGoogleSyncInfo,
  listTaggedPrismEvents,
} from '@/lib/calendar';

/**
 * One-time cleanup tool for orphan Prism-tagged Google Calendar events.
 *
 * Background: prior to the syncTaskCalendarEvent fix in /api/tasks/[id],
 * task time-block PATCHes called createGoogleEvent without `prismRecordId`,
 * and silent sync failures could leave Task.calendarEventId out of sync with
 * the actual Google event id. This left Prism-tagged events on the user's
 * Google Calendar that no Prism record currently references — visible to the
 * user as duplicate events.
 *
 * Behavior:
 *   POST /api/admin/calendar-cleanup
 *   body: { dryRun?: boolean = true, daysBack?: number = 90, daysForward?: number = 90, userId?: string }
 *
 * Builds a "known-good" set of calendarEventIds from every Prism table that
 * links to Google (Task, WorkBlock, AimInstance, Review, Meeting,
 * PowerdownSession). Lists every Prism-tagged event in the date window. Any
 * tagged event whose id is NOT in the known-good set is reported as an
 * orphan. When `dryRun: false`, orphans are deleted.
 *
 * Admin can target another user via `userId`. A regular user can only
 * clean their own calendar.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: {
    dryRun?: boolean;
    daysBack?: number;
    daysForward?: number;
    userId?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Empty body is fine — defaults apply.
  }

  const targetUserId = body.userId ?? auth.userId;
  if (targetUserId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dryRun = body.dryRun !== false; // default true
  const daysBack = Number.isFinite(body.daysBack) ? Math.max(1, Math.min(365, body.daysBack as number)) : 90;
  const daysForward = Number.isFinite(body.daysForward) ? Math.max(1, Math.min(365, body.daysForward as number)) : 90;

  const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(targetUserId);
  if (!hasGoogle) {
    return Response.json({ error: 'Google Calendar is not connected for this user' }, { status: 400 });
  }

  const now = Date.now();
  const timeMin = new Date(now - daysBack * 86_400_000).toISOString();
  const timeMax = new Date(now + daysForward * 86_400_000).toISOString();

  // Build the known-good calendarEventId set across every Prism table that
  // links to Google. Any tagged event whose id is in this set is considered
  // healthy and must be preserved.
  const [tasks, workBlocks, aimInstances, reviews, meetings, pdSessions] = await Promise.all([
    prisma.task.findMany({
      where: { ownerId: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true, title: true },
    }),
    prisma.workBlock.findMany({
      where: { userId: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true },
    }),
    prisma.aimInstance.findMany({
      where: { userId: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true },
    }),
    prisma.review.findMany({
      where: { userId: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true },
    }),
    prisma.meeting.findMany({
      where: { createdById: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true },
    }),
    prisma.powerdownSession.findMany({
      where: { userId: targetUserId, calendarEventId: { not: null } },
      select: { id: true, calendarEventId: true },
    }),
  ]);

  const knownGood = new Set<string>();
  for (const t of tasks) if (t.calendarEventId) knownGood.add(t.calendarEventId);
  for (const b of workBlocks) if (b.calendarEventId) knownGood.add(b.calendarEventId);
  for (const a of aimInstances) if (a.calendarEventId) knownGood.add(a.calendarEventId);
  for (const r of reviews) if (r.calendarEventId) knownGood.add(r.calendarEventId);
  for (const m of meetings) if (m.calendarEventId) knownGood.add(m.calendarEventId);
  for (const p of pdSessions) if (p.calendarEventId) knownGood.add(p.calendarEventId);

  // Pull every Prism-tagged event from the sync target calendar in the window.
  const taggedEvents = await listTaggedPrismEvents(targetUserId, timeMin, timeMax, [targetCalendarId]);

  // Identify orphans. Also collect a friendly summary for each.
  interface OrphanInfo {
    eventId: string;
    summary?: string;
    start?: string;
    end?: string;
    prismType?: string;
    prismRecordId?: string;
    reason: 'no-record-link' | 'record-link-mismatch';
  }
  const orphans: OrphanInfo[] = [];
  for (const ev of taggedEvents) {
    const eventId = ev.id as string | undefined;
    if (!eventId) continue;
    if (knownGood.has(eventId)) continue;

    const extProps = (ev.extendedProperties as { private?: Record<string, string> } | undefined)?.private ?? {};
    const prismRecordId = extProps.prismRecordId;
    const prismType = extProps.prismType;

    // If the event has a prismRecordId, check whether the linked Prism record
    // exists at all (it may still exist but with a *different* calendarEventId
    // — that's also an orphan because the live record is pointing somewhere
    // else). Either way: not known-good ⇒ orphan.
    orphans.push({
      eventId,
      summary: typeof ev.summary === 'string' ? ev.summary : undefined,
      start: ((ev.start as Record<string, unknown> | undefined)?.dateTime ?? (ev.start as Record<string, unknown> | undefined)?.date) as string | undefined,
      end: ((ev.end as Record<string, unknown> | undefined)?.dateTime ?? (ev.end as Record<string, unknown> | undefined)?.date) as string | undefined,
      prismType,
      prismRecordId,
      reason: prismRecordId ? 'record-link-mismatch' : 'no-record-link',
    });
  }

  if (dryRun) {
    return Response.json(
      {
        dryRun: true,
        userId: targetUserId,
        calendarId: targetCalendarId,
        window: { timeMin, timeMax },
        taggedEventCount: taggedEvents.length,
        knownGoodCount: knownGood.size,
        orphanCount: orphans.length,
        orphans,
      },
      NO_STORE,
    );
  }

  // Execute mode: delete each orphan. Per-event failures are captured but
  // don't stop the sweep — partial progress is better than nothing.
  const deleted: string[] = [];
  const failed: Array<{ eventId: string; error: string }> = [];
  for (const orphan of orphans) {
    try {
      const ok = await deleteGoogleEvent(targetUserId, orphan.eventId, targetCalendarId);
      if (ok) deleted.push(orphan.eventId);
      else failed.push({ eventId: orphan.eventId, error: 'deleteGoogleEvent returned false' });
    } catch (err) {
      failed.push({
        eventId: orphan.eventId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return Response.json(
    {
      dryRun: false,
      userId: targetUserId,
      calendarId: targetCalendarId,
      window: { timeMin, timeMax },
      orphanCount: orphans.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
      deleted,
      failed,
    },
    NO_STORE,
  );
}
