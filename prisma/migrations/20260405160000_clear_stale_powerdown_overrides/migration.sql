-- Clear stale timeBlock overrides from PowerdownSession records that were
-- auto-created by the sync route. These carried copies of whatever the
-- default powerdownTime was at sync time, causing powerdown events to
-- appear at inconsistent times after the user changed their setting.
-- Real user overrides (from drag) will need to be re-dragged.
UPDATE "PowerdownSession"
SET "timeBlockStart" = NULL, "timeBlockEnd" = NULL
WHERE "calendarEventId" IS NOT NULL
  AND "timeBlockStart" IS NOT NULL;
