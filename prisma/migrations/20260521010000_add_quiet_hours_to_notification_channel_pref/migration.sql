-- Add per-(notifType × channel) quiet-hours window to NotificationChannelPref.
-- Backwards-compatible: all existing rows default to disabled.
-- quietHoursStart / quietHoursEnd are minutes-past-midnight (0-1439) in the
-- user's local timezone. Wrap-around windows (start > end) are supported.
ALTER TABLE "NotificationChannelPref"
  ADD COLUMN "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quietHoursStart" INTEGER,
  ADD COLUMN "quietHoursEnd" INTEGER;
