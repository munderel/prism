-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "durationEndDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_ownerId_isWinTheDay_winTheDayRank_idx" ON "Task"("ownerId", "isWinTheDay", "winTheDayRank");
