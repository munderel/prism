-- AlterTable (safe)
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "meetLink" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);

-- AlterTable (safe)
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "meetingReminders" BOOLEAN NOT NULL DEFAULT true;
