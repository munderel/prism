-- Component 19: Add notification inbox, per-channel prefs, and enrich PushSubscription
-- Additive only — NotificationPreference columns are preserved (drop in Component 19b).

-- Create NotificationType enum
CREATE TYPE "NotificationType" AS ENUM ('DERAILING', 'MENTION', 'REVIEW_NAG', 'MEETING_REMINDER', 'AIM_INVITE', 'WORKBLOCK_INVITE', 'GENERIC');

-- Create NotificationChannel enum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH_DESKTOP', 'PUSH_MOBILE', 'IN_APP');

-- Add new columns to PushSubscription (all nullable for backwards compatibility)
ALTER TABLE "PushSubscription" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "label" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create NotificationChannelPref table
CREATE TABLE "NotificationChannelPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifType" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationChannelPref_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationChannelPref_userId_notifType_channel_key" ON "NotificationChannelPref"("userId", "notifType", "channel");
CREATE INDEX "NotificationChannelPref_userId_idx" ON "NotificationChannelPref"("userId");

ALTER TABLE "NotificationChannelPref" ADD CONSTRAINT "NotificationChannelPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create Notification inbox table
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
