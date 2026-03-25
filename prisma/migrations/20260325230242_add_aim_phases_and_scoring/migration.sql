-- AlterTable
ALTER TABLE "AimCategory" ADD COLUMN     "schedulePeriod" TEXT NOT NULL DEFAULT 'both';

-- AlterTable
ALTER TABLE "AimInstance" ADD COLUMN     "phaseAtCompletion" TEXT,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "selectedActivity" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "aimInstanceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoScheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "casualHoursEnd" TEXT,
ADD COLUMN     "casualHoursStart" TEXT,
ADD COLUMN     "taskSchedulePeriod" TEXT,
ADD COLUMN     "workingHoursEnd" TEXT,
ADD COLUMN     "workingHoursStart" TEXT;

-- AlterTable
ALTER TABLE "UserAim" ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentPhase" TEXT NOT NULL DEFAULT 'SEED',
ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customSchedulePeriod" TEXT,
ADD COLUMN     "lastCompletedAt" TIMESTAMP(3),
ADD COLUMN     "phaseStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_aimInstanceId_fkey" FOREIGN KEY ("aimInstanceId") REFERENCES "AimInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
