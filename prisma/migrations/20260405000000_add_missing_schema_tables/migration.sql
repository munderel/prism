-- CreateEnum (safe)
DO $$ BEGIN
  CREATE TYPE "KpiTimeLevel" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY', 'FIVE_YEAR', 'HHG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum (safe: only run if ReviewType doesn't already have YEARLY)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ReviewType' AND e.enumlabel = 'YEARLY'
  ) THEN
    CREATE TYPE "ReviewType_new" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
    ALTER TABLE "Review" ALTER COLUMN "reviewType" TYPE "ReviewType_new" USING ("reviewType"::text::"ReviewType_new");
    ALTER TABLE "ReviewTemplate" ALTER COLUMN "reviewType" TYPE "ReviewType_new" USING ("reviewType"::text::"ReviewType_new");
    ALTER TYPE "ReviewType" RENAME TO "ReviewType_old";
    ALTER TYPE "ReviewType_new" RENAME TO "ReviewType";
    DROP TYPE "public"."ReviewType_old";
  END IF;
END $$;

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'REVIEW';

-- DropForeignKey (safe: only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Session') THEN
    ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "ProcessExecution_processId_idx";

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "token" TEXT;

-- AlterTable
ALTER TABLE "Process"
ADD COLUMN IF NOT EXISTS "scheduledDayOfMonth" INTEGER,
ADD COLUMN IF NOT EXISTS "scheduledDayOfWeek" INTEGER,
ADD COLUMN IF NOT EXISTS "scheduledTime" TEXT;

-- AlterTable
ALTER TABLE "ProcessExecution"
ADD COLUMN IF NOT EXISTS "timeBlockEnd" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "timeBlockStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "autoScheduleEnabled";

-- DropTable
DROP TABLE IF EXISTS "Session";

-- DropTable
DROP TABLE IF EXISTS "VerificationToken";

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecurringTeamReview" (
    "id" TEXT NOT NULL,
    "reviewType" "ReviewType" NOT NULL,
    "dayOfWeek" INTEGER,
    "recurrenceRule" TEXT,
    "time" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTeamReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecurringTeamReviewMember" (
    "id" TEXT NOT NULL,
    "recurringTeamReviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RecurringTeamReviewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClearGoal" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdInPowerdownId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalAssignee" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessKpi" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessKpiEntry" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessKpiEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessKpiGoal" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "timeLevel" "KpiTimeLevel" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessKpiGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecurringTeamReviewMember_userId_idx" ON "RecurringTeamReviewMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringTeamReviewMember_recurringTeamReviewId_userId_key" ON "RecurringTeamReviewMember"("recurringTeamReviewId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClearGoal_taskId_idx" ON "ClearGoal"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalAssignee_userId_idx" ON "GoalAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GoalAssignee_goalId_userId_key" ON "GoalAssignee"("goalId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessKpi_processId_idx" ON "ProcessKpi"("processId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessKpi_goalId_idx" ON "ProcessKpi"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessKpiEntry_kpiId_date_idx" ON "ProcessKpiEntry"("kpiId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessKpiEntry_userId_idx" ON "ProcessKpiEntry"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessKpiGoal_kpiId_idx" ON "ProcessKpiGoal"("kpiId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessKpiGoal_kpiId_timeLevel_key" ON "ProcessKpiGoal"("kpiId", "timeLevel");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessExecution_processId_scheduledDate_idx" ON "ProcessExecution"("processId", "scheduledDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_dueDate_status_idx" ON "Task"("dueDate", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_goalId_status_idx" ON "Task"("goalId", "status");

-- AddForeignKey (safe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringTeamReview_createdById_fkey') THEN
    ALTER TABLE "RecurringTeamReview" ADD CONSTRAINT "RecurringTeamReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringTeamReviewMember_recurringTeamReviewId_fkey') THEN
    ALTER TABLE "RecurringTeamReviewMember" ADD CONSTRAINT "RecurringTeamReviewMember_recurringTeamReviewId_fkey" FOREIGN KEY ("recurringTeamReviewId") REFERENCES "RecurringTeamReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringTeamReviewMember_userId_fkey') THEN
    ALTER TABLE "RecurringTeamReviewMember" ADD CONSTRAINT "RecurringTeamReviewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClearGoal_taskId_fkey') THEN
    ALTER TABLE "ClearGoal" ADD CONSTRAINT "ClearGoal_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GoalAssignee_goalId_fkey') THEN
    ALTER TABLE "GoalAssignee" ADD CONSTRAINT "GoalAssignee_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GoalAssignee_userId_fkey') THEN
    ALTER TABLE "GoalAssignee" ADD CONSTRAINT "GoalAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Feedback_userId_fkey') THEN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessKpi_processId_fkey') THEN
    ALTER TABLE "ProcessKpi" ADD CONSTRAINT "ProcessKpi_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessKpi_goalId_fkey') THEN
    ALTER TABLE "ProcessKpi" ADD CONSTRAINT "ProcessKpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessKpiEntry_kpiId_fkey') THEN
    ALTER TABLE "ProcessKpiEntry" ADD CONSTRAINT "ProcessKpiEntry_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "ProcessKpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessKpiEntry_userId_fkey') THEN
    ALTER TABLE "ProcessKpiEntry" ADD CONSTRAINT "ProcessKpiEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessKpiGoal_kpiId_fkey') THEN
    ALTER TABLE "ProcessKpiGoal" ADD CONSTRAINT "ProcessKpiGoal_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "ProcessKpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Handle RecurringTeamReview in ReviewType enum rename (done after table creation)
ALTER TABLE "RecurringTeamReview" ALTER COLUMN "reviewType" TYPE "ReviewType" USING ("reviewType"::text::"ReviewType");
