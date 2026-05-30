-- Issue 8: background Google Calendar sync cron processes users oldest-first.
-- `lastGoogleSyncAt` is the rotation cursor (last time the cron synced a user);
-- `googleSyncLockedAt` is a self-expiring claim lock that serializes a
-- background cron run against a manual/user-triggered run for the same user.
ALTER TABLE "User" ADD COLUMN     "lastGoogleSyncAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "googleSyncLockedAt" TIMESTAMP(3);
