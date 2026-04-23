-- Non-destructive: expose Google Calendar sync outcome on each work block so
-- drag-created work blocks can be pushed to Google and failures surfaced in
-- the UI (previously WorkBlock had no sync fields at all and was Prism-only).

ALTER TABLE "WorkBlock" ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT;
ALTER TABLE "WorkBlock" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3);
ALTER TABLE "WorkBlock" ADD COLUMN IF NOT EXISTS "syncError" TEXT;
