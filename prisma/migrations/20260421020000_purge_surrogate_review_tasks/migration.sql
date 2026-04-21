-- One-shot cleanup of legacy REVIEW-typed Task rows created by prior versions
-- of the /api/cron/review-nag cron. Reviews are now surfaced directly via the
-- dashboard banner, so surrogate REVIEW tasks are redundant and were leaking
-- into unscheduled-task lists.
--
-- Previously the cron did this `deleteMany` on every run, which was
-- unbounded and would silently wipe any newly-created REVIEW tasks within
-- the hour if a feature path ever re-introduced them. Moving to a one-shot
-- migration means the cleanup runs exactly once.

DELETE FROM "Task" WHERE "taskType" = 'REVIEW';
