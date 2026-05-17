-- Partial unique index preventing duplicate Process-generated tasks for the
-- same (processId, dueDate, title). The race window is in
-- generateTasksForCurrentPeriod() — concurrent GETs on /api/tasks and
-- /api/calendar could both pass the count() check and insert. The atomic
-- claim via Process.lastRunAt now serializes those callers; this index is
-- the DB-level safety net.
--
-- WHY title in the key: ADVANCED-mode processes with multiple steps create
-- one Task per step with the same (processId, dueDate). A 2-column unique
-- would break multi-step processes.
--
-- WHY partial (WHERE "processId" IS NOT NULL): the vast majority of Tasks
-- have no processId — only Process-generated MAINTENANCE tasks do. A partial
-- index keeps the constraint surgical and cheap.
--
-- PRE-CONDITION: this migration will fail if duplicate rows still exist in
-- production. Run prism/prisma/migrations/20260516120000_task_process_period_unique/cleanup.sql
-- against Neon BEFORE pushing this commit to Vercel.

CREATE UNIQUE INDEX "Task_processId_dueDate_title_unique"
  ON "Task" ("processId", "dueDate", "title")
  WHERE "processId" IS NOT NULL;
