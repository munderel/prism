-- AlterTable
ALTER TABLE "GoalStack" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "calendarEventId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assigneeId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "powerdownTime" TEXT,
ADD COLUMN     "selectedCalendarIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "UserAim" ADD COLUMN     "derailSensitivityDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reminderTimeMinutes" INTEGER;

-- CreateTable
CREATE TABLE "ReviewAnswer" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "answerData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistractionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "logDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'powerdown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAnswer_reviewId_idx" ON "ReviewAnswer"("reviewId");

-- CreateIndex
CREATE INDEX "DistractionLog_userId_logDate_idx" ON "DistractionLog"("userId", "logDate");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAnswer" ADD CONSTRAINT "ReviewAnswer_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistractionLog" ADD CONSTRAINT "DistractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
