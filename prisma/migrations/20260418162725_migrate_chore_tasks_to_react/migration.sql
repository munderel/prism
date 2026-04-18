-- Data migration: CHORE task type is deprecated. Convert all existing CHORE
-- tasks to REACT so no user-visible remnants remain. The Postgres enum value
-- CHORE stays in place (non-destructive) to avoid touching the enum type.

UPDATE "Task" SET "taskType" = 'REACT' WHERE "taskType" = 'CHORE';
