import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { getCalendarClient, listWritableCalendarIds } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

const MANAGED_TITLES = [
  'Power Down Ritual',
  'Weekly Review',
  'Monthly Review',
  'Yearly Review',
] as const;

/**
 * Read-only diagnostic for duplicate Prism-managed events. Lists every event
 * matching a Prism-managed title across every calendar the user can write to,
 * along with the raw `extendedProperties`, `creator`, `organizer`, and
 * `recurringEventId` fields so we can tell tagged-vs-untagged orphans apart
 * from a single screenshot of the response.
 *
 * Admin-only GET (surface reduction — it dumps raw creator/organizer/
 * extendedProperties and sync state). Data stays scoped to the caller's own
 * Google calendars. Never deletes or modifies anything.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const writableCalendars = await listWritableCalendarIds(auth.userId);
  const calendar = await getCalendarClient(auth.userId);

  const eventsByCalendar: Record<string, unknown[]> = {};
  if (calendar) {
    for (const calId of writableCalendars) {
      const found: unknown[] = [];
      for (const title of MANAGED_TITLES) {
        const res = await calendar.events
          .list({
            calendarId: calId,
            q: title,
            singleEvents: false,
            showDeleted: false,
            maxResults: 50,
          })
          .catch(() => ({ data: { items: [] } }));
        for (const ev of res.data.items ?? []) {
          // `q` is a fuzzy free-text search; restrict to exact-title matches.
          if (ev.summary !== title) continue;
          // Skip modified-instance overrides; their master is returned separately.
          if (ev.recurringEventId) continue;
          found.push({
            id: ev.id,
            summary: ev.summary,
            description: ev.description,
            recurrence: ev.recurrence,
            extendedProperties: ev.extendedProperties,
            creator: ev.creator,
            organizer: ev.organizer,
            status: ev.status,
            sourceCalendar: calId,
          });
        }
      }
      eventsByCalendar[calId] = found;
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      syncTargetCalendarId: true,
      selectedCalendarIds: true,
      googleSyncState: true,
    },
  });

  return Response.json(
    {
      syncTargetCalendarId: user?.syncTargetCalendarId ?? null,
      selectedCalendarIds: user?.selectedCalendarIds ?? null,
      googleSyncState: user?.googleSyncState ?? null,
      writableCalendars,
      eventsByCalendar,
    },
    NO_STORE,
  );
}
