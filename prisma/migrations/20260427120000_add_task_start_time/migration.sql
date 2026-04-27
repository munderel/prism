-- Add optional startTime to Task. Hides the task from the dashboard and
-- /tasks list until this moment is reached. Null = visible immediately
-- (existing behavior for all current rows).

ALTER TABLE "Task" ADD COLUMN "startTime" TIMESTAMP(3);

CREATE INDEX "Task_ownerId_startTime_idx" ON "Task"("ownerId", "startTime");
