/**
 * backfill-notification-channel-prefs.ts
 *
 * One-time idempotent backfill: converts every existing NotificationPreference
 * row into corresponding NotificationChannelPref rows.
 *
 * Mapping from flat flags → (notifType × channel):
 *   emailEnabled     → EMAIL   for all notification types
 *   pushEnabled      → PUSH_DESKTOP + PUSH_MOBILE for all notification types
 *   derailingAlerts  → DERAILING  (EMAIL, PUSH_DESKTOP, PUSH_MOBILE, IN_APP)
 *   mentionAlerts    → MENTION    (EMAIL, PUSH_DESKTOP, PUSH_MOBILE, IN_APP)
 *   reviewNags       → REVIEW_NAG (EMAIL, PUSH_DESKTOP, PUSH_MOBILE, IN_APP)
 *   meetingReminders → MEETING_REMINDER (EMAIL, PUSH_DESKTOP, PUSH_MOBILE, IN_APP)
 *
 * Idempotent: uses upsert (createMany with skipDuplicates) so it is safe to run
 * multiple times — existing rows are not modified.
 *
 * Usage:
 *   npx tsx scripts/backfill-notification-channel-prefs.ts
 */

import { PrismaClient, NotificationType, NotificationChannel } from '@prisma/client';

const prisma = new PrismaClient();

const ALL_CHANNELS: NotificationChannel[] = [
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH_DESKTOP,
  NotificationChannel.PUSH_MOBILE,
  NotificationChannel.IN_APP,
];

interface ChannelPrefInput {
  userId: string;
  notifType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

async function main() {
  const allPrefs = await prisma.notificationPreference.findMany();
  console.log(`Found ${allPrefs.length} NotificationPreference rows to backfill.`);

  let totalInserted = 0;

  for (const pref of allPrefs) {
    const rows: ChannelPrefInput[] = [];

    // Build per-type rows.
    // enabled = typeFlag && channelFlag (e.g. derailingAlerts=false means disabled
    // for all channels regardless of emailEnabled/pushEnabled).
    const typeMap: Array<{ notifType: NotificationType; flag: boolean }> = [
      { notifType: NotificationType.DERAILING, flag: pref.derailingAlerts },
      { notifType: NotificationType.MENTION, flag: pref.mentionAlerts },
      { notifType: NotificationType.REVIEW_NAG, flag: pref.reviewNags },
      { notifType: NotificationType.MEETING_REMINDER, flag: pref.meetingReminders },
      // Types not present in flat prefs default to enabled=true
      { notifType: NotificationType.AIM_INVITE, flag: true },
      { notifType: NotificationType.WORKBLOCK_INVITE, flag: true },
      { notifType: NotificationType.GENERIC, flag: true },
    ];

    for (const { notifType, flag } of typeMap) {
      for (const channel of ALL_CHANNELS) {
        let enabled = flag;
        if (channel === NotificationChannel.EMAIL) {
          enabled = enabled && pref.emailEnabled;
        } else if (
          channel === NotificationChannel.PUSH_DESKTOP ||
          channel === NotificationChannel.PUSH_MOBILE
        ) {
          enabled = enabled && pref.pushEnabled;
        }
        // IN_APP always follows the type flag only (no separate in-app toggle in old prefs)
        rows.push({ userId: pref.userId, notifType, channel, enabled });
      }
    }

    const result = await prisma.notificationChannelPref.createMany({
      data: rows,
      skipDuplicates: true,
    });
    totalInserted += result.count;
  }

  console.log(`Backfill complete. Inserted ${totalInserted} NotificationChannelPref rows (duplicates skipped).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
