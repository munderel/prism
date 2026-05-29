-- Additive, backwards-compatible schema changes for the multi-issue fix batch.
-- Issue 8: incremental Google Calendar sync token store (per calendar).
ALTER TABLE "User" ADD COLUMN     "googleSyncTokenByCalendar" JSONB NOT NULL DEFAULT '{}';

-- Issue 7a: REACT tasks default public; private keeps them owner-only.
ALTER TABLE "Task" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Issue 7b: meals (food blocks) now sync to Google Calendar.
ALTER TABLE "FoodBlock" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- Issue 3: per-aim opt-out of the SEED phase.
ALTER TABLE "UserAim" ADD COLUMN     "skipSeedPhase" BOOLEAN NOT NULL DEFAULT false;

-- Issue 3: org-wide toggle to disable the admin "Seed Default AIMs" action.
ALTER TABLE "CompanyAuthSettings" ADD COLUMN     "disableSeedAims" BOOLEAN NOT NULL DEFAULT false;

-- Issue 7a: index public-REACT lookups.
CREATE INDEX "Task_taskType_isPrivate_idx" ON "Task"("taskType", "isPrivate");
