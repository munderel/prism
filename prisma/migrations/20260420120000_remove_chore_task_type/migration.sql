-- Remove CHORE from the TaskType enum.
--
-- A prior migration (20260418162725_migrate_chore_tasks_to_react) already
-- converted all CHORE rows to REACT, so column values are already valid under
-- the new enum shape. Any row still on CHORE is an orphan created after that
-- migration — delete it, then recreate the enum without the value.
--
-- Prisma wraps each migration in its own transaction, so no explicit BEGIN /
-- COMMIT is needed here.

DELETE FROM "Task" WHERE "taskType" = 'CHORE';

ALTER TYPE "TaskType" RENAME TO "TaskType_old";

CREATE TYPE "TaskType" AS ENUM ('GOAL_STACK', 'REACT', 'MAINTENANCE', 'REVIEW');

ALTER TABLE "Task"
  ALTER COLUMN "taskType" TYPE "TaskType"
  USING ("taskType"::text::"TaskType");

DROP TYPE "TaskType_old";
