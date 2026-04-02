-- Restore leaderboard visibility behavior after the initial opt-out migration
ALTER TABLE "User"
ALTER COLUMN "isPublicOnLeaderboard" SET DEFAULT true;

UPDATE "User"
SET "isPublicOnLeaderboard" = true
WHERE "isPublicOnLeaderboard" = false;
