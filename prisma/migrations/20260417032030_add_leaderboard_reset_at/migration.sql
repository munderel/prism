-- Non-destructive: add a nullable marker column so the leaderboard can
-- windowing-filter all counted items by "completed after this timestamp"
-- when the user resets their leaderboard.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leaderboardResetAt" TIMESTAMP(3);
