-- Add work-block feature: per-session scheduling, hybrid progress tracking, and powerdown block review.

-- 1. New enum for work-block review status.
CREATE TYPE "WorkBlockStatus" AS ENUM ('PENDING', 'COMPLETED', 'PARTIAL', 'MISSED');

-- 2. User default work-block duration (minutes).
ALTER TABLE "User"
  ADD COLUMN "defaultWorkBlockMinutes" INTEGER NOT NULL DEFAULT 90;

-- 3. WorkBlock table: a task may have many scheduled sessions.
CREATE TABLE "WorkBlock" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "start" TIMESTAMP(3) NOT NULL,
  "end" TIMESTAMP(3) NOT NULL,
  "mainObjective" TEXT NOT NULL,
  "completionStatus" "WorkBlockStatus" NOT NULL DEFAULT 'PENDING',
  "actualMinutes" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkBlock_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkBlock"
  ADD CONSTRAINT "WorkBlock_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkBlock"
  ADD CONSTRAINT "WorkBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WorkBlock_userId_start_idx" ON "WorkBlock"("userId", "start");
CREATE INDEX "WorkBlock_taskId_idx" ON "WorkBlock"("taskId");
CREATE INDEX "WorkBlock_completionStatus_idx" ON "WorkBlock"("completionStatus");

-- 4. ClearGoal gains optional workBlockId so sub-goals can be scoped to a session.
ALTER TABLE "ClearGoal"
  ADD COLUMN "workBlockId" TEXT;

ALTER TABLE "ClearGoal"
  ADD CONSTRAINT "ClearGoal_workBlockId_fkey" FOREIGN KEY ("workBlockId") REFERENCES "WorkBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ClearGoal_workBlockId_idx" ON "ClearGoal"("workBlockId");

-- 5. TaskCompletionSnapshot: frozen stats when user marks a task complete.
CREATE TABLE "TaskCompletionSnapshot" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL,
  "completedMinutes" INTEGER NOT NULL,
  "scheduledMinutes" INTEGER NOT NULL,
  "goalsHit" INTEGER NOT NULL,
  "goalsDefined" INTEGER NOT NULL,
  "overrunMinutes" INTEGER NOT NULL,
  "blocksCompleted" INTEGER NOT NULL,
  "blocksMissed" INTEGER NOT NULL,
  "blocksPartial" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCompletionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskCompletionSnapshot_taskId_key" ON "TaskCompletionSnapshot"("taskId");
CREATE INDEX "TaskCompletionSnapshot_userId_completedAt_idx" ON "TaskCompletionSnapshot"("userId", "completedAt");

ALTER TABLE "TaskCompletionSnapshot"
  ADD CONSTRAINT "TaskCompletionSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCompletionSnapshot"
  ADD CONSTRAINT "TaskCompletionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. PowerdownWorkBlockReview: aggregated result of the daily block review step.
CREATE TABLE "PowerdownWorkBlockReview" (
  "id" TEXT NOT NULL,
  "powerdownSessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reviewDate" TIMESTAMP(3) NOT NULL,
  "blocksTotal" INTEGER NOT NULL,
  "blocksCompleted" INTEGER NOT NULL,
  "blocksPartial" INTEGER NOT NULL,
  "blocksMissed" INTEGER NOT NULL,
  "totalScheduledMinutes" INTEGER NOT NULL,
  "totalCompletedMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PowerdownWorkBlockReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PowerdownWorkBlockReview_userId_reviewDate_idx" ON "PowerdownWorkBlockReview"("userId", "reviewDate");
CREATE INDEX "PowerdownWorkBlockReview_powerdownSessionId_idx" ON "PowerdownWorkBlockReview"("powerdownSessionId");

ALTER TABLE "PowerdownWorkBlockReview"
  ADD CONSTRAINT "PowerdownWorkBlockReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Backfill: every existing task with a time block becomes one WorkBlock.
-- IDs are generated via gen_random_uuid() (Postgres 13+, built in without
-- pgcrypto). The original `'t_' || md5(random() || clock_timestamp())`
-- approach relied on md5 collision resistance for uniqueness and didn't
-- match the cuid shape the rest of the schema uses.
INSERT INTO "WorkBlock" ("id", "taskId", "userId", "start", "end", "mainObjective", "completionStatus", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text AS "id",
  t."id" AS "taskId",
  t."ownerId" AS "userId",
  t."timeBlockStart" AS "start",
  t."timeBlockEnd" AS "end",
  t."title" AS "mainObjective",
  CASE WHEN t."status" = 'DONE' THEN 'COMPLETED'::"WorkBlockStatus" ELSE 'PENDING'::"WorkBlockStatus" END AS "completionStatus",
  COALESCE(t."createdAt", CURRENT_TIMESTAMP) AS "createdAt",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "Task" t
WHERE t."timeBlockStart" IS NOT NULL
  AND t."timeBlockEnd" IS NOT NULL;
