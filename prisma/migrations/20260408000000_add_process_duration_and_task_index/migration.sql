-- AlterTable (safe)
ALTER TABLE "Process" ADD COLUMN IF NOT EXISTS "durationEndDate" TIMESTAMP(3);

-- CreateIndex (safe)
CREATE INDEX IF NOT EXISTS "Task_ownerId_isWinTheDay_winTheDayRank_idx" ON "Task"("ownerId", "isWinTheDay", "winTheDayRank");
