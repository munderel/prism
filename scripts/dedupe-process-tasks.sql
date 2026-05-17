-- One-off cleanup for duplicate Process-generated tasks before adding the
-- partial unique index in migration 20260516120000_task_process_period_unique.
-- Must run against Neon BEFORE that migration deploys, otherwise the
-- CREATE UNIQUE INDEX will fail with a duplicate-key error.
--
-- Root cause: pre-fix, generateTasksForCurrentPeriod() used a non-atomic
-- count-then-create pattern. Concurrent GETs on /api/tasks and /api/calendar
-- could both pass the count() check and insert duplicate rows.
--
-- This script keeps the OLDEST row per (processId, dueDate, title) group and
-- deletes the rest. Oldest wins because the first insert is the "real" one;
-- the race-window duplicates are by definition later.

-- ─── Step 1: dry-run — preview which rows would be deleted ───────────────────
-- Expected: only race-window duplicates. If this returns rows you didn't
-- expect (e.g., legitimate multiple tasks with same title/dueDate from
-- editing workflows), stop and investigate before running step 2.

SELECT id, "processId", "dueDate", title, "createdAt", status
FROM "Task"
WHERE "processId" IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON ("processId", "dueDate", title) id
    FROM "Task"
    WHERE "processId" IS NOT NULL
    ORDER BY "processId", "dueDate", title, "createdAt" ASC
  )
ORDER BY "processId", "dueDate", title, "createdAt";

-- ─── Step 2: actual delete ───────────────────────────────────────────────────
-- Run only after Step 1 returns the expected rows.

-- BEGIN;
-- DELETE FROM "Task"
-- WHERE "processId" IS NOT NULL
--   AND id NOT IN (
--     SELECT DISTINCT ON ("processId", "dueDate", title) id
--     FROM "Task"
--     WHERE "processId" IS NOT NULL
--     ORDER BY "processId", "dueDate", title, "createdAt" ASC
--   );
-- COMMIT;
