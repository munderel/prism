-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "meetLink" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "lastReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "meetingReminders" BOOLEAN NOT NULL DEFAULT true;
