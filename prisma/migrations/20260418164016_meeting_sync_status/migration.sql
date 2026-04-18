-- Non-destructive: expose Google Calendar sync outcome on each meeting so
-- the UI can surface failures (previously the sync failed silently in a
-- fire-and-forget catch block with only a console.warn).

ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "syncError" TEXT;
