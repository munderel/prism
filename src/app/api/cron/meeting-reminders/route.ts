import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';
import { generateMeetingInstances, isUserInMeeting } from '@/lib/meeting-utils';
import { NotificationType } from '@prisma/client';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 10 * 60_000); // 10 minutes from now
    const recentCutoff = new Date(now.getTime() - 15 * 60_000); // 15 minutes ago

    // Fetch all meetings that haven't been reminded recently
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lt: recentCutoff } },
        ],
      },
      select: {
        id: true,
        title: true,
        cadence: true,
        dayOfWeek: true,
        occurDate: true,
        timeStart: true,
        timeEnd: true,
        attendeeIds: true,
        meetLink: true,
        createdById: true,
        lastReminderSentAt: true,
      },
    });

    // Collect all unique user IDs from meetings for timezone + preference lookup
    const allUserIds = new Set<string>();
    for (const meeting of meetings) {
      const attendees = Array.isArray(meeting.attendeeIds) ? meeting.attendeeIds as string[] : [];
      for (const id of attendees) allUserIds.add(id);
      allUserIds.add(meeting.createdById);
    }

    // Batch-fetch user timezones
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(allUserIds) } },
      select: { id: true, timezone: true },
    });

    const tzMap = new Map(users.map((u) => [u.id, u.timezone ?? 'America/New_York']));

    let checked = 0;
    let notified = 0;
    const meetingsToUpdate: string[] = [];

    for (const meeting of meetings) {
      // Use the creator's timezone as the reference for instance generation
      const tz = tzMap.get(meeting.createdById) ?? 'America/New_York';
      const instances = generateMeetingInstances(meeting, now, windowEnd, tz);

      if (instances.length === 0) continue;
      checked++;

      // Collect attendees who should be notified (per-channel gating handled inside notifyUser)
      const attendeeIds = Array.from(allUserIds).filter((uid) => isUserInMeeting(meeting, uid));

      if (attendeeIds.length === 0) continue;

      // Send notifications
      const notifications = attendeeIds.map((userId) =>
        notifyUser(
          userId,
          'Meeting in 10 minutes',
          `"${meeting.title}" starts at ${meeting.timeStart}`,
          meeting.meetLink || '/calendar',
          NotificationType.MEETING_REMINDER,
        )
      );

      await Promise.all(notifications);
      notified += attendeeIds.length;
      meetingsToUpdate.push(meeting.id);
    }

    // Mark meetings as reminded
    if (meetingsToUpdate.length > 0) {
      await prisma.meeting.updateMany({
        where: { id: { in: meetingsToUpdate } },
        data: { lastReminderSentAt: now },
      });
    }

    return Response.json({ ok: true, checked, notified });
  } catch (error) {
    console.error('[cron/meeting-reminders] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
