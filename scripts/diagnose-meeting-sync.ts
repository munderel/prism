// Read-only diagnostic: print the Google Calendar sync state for meetings
// whose title matches a given substring (default "test"). Useful when a
// meeting row appears to have silently failed to sync — this shows whether
// calendarEventId, syncedAt, syncError, and calendarIdUsed were populated.
//
// Usage:
//   DATABASE_URL=postgres://... npx tsx scripts/diagnose-meeting-sync.ts [title-substring]

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const needle = process.argv[2] ?? 'test';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[diagnose] Missing DATABASE_URL');
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const meetings = await prisma.meeting.findMany({
    where: { title: { contains: needle, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      cadence: true,
      occurDate: true,
      timeStart: true,
      timeEnd: true,
      createdAt: true,
      calendarEventId: true,
      calendarIdUsed: true,
      syncedAt: true,
      syncError: true,
      htmlLink: true,
      meetLink: true,
    },
  });

  if (meetings.length === 0) {
    console.log(`[diagnose] no meetings match "${needle}"`);
    return;
  }

  for (const m of meetings) {
    const verdict =
      m.calendarEventId && m.syncedAt ? 'SYNCED' :
      m.syncError ? `FAILED: ${m.syncError}` :
      m.calendarEventId ? 'EVENT ID SET BUT NO syncedAt (odd)' :
      'NEVER SYNCED (middle state — no eventId and no error)';
    console.log(
      [
        `id=${m.id}`,
        `title=${JSON.stringify(m.title)}`,
        `cadence=${m.cadence}`,
        `occurDate=${m.occurDate?.toISOString() ?? '-'}`,
        `time=${m.timeStart}-${m.timeEnd}`,
        `createdAt=${m.createdAt.toISOString()}`,
        `calendarEventId=${m.calendarEventId ?? '-'}`,
        `calendarIdUsed=${m.calendarIdUsed ?? '-'}`,
        `syncedAt=${m.syncedAt?.toISOString() ?? '-'}`,
        `syncError=${m.syncError ?? '-'}`,
        `htmlLink=${m.htmlLink ?? '-'}`,
        `verdict=${verdict}`,
      ].join(' | ')
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
