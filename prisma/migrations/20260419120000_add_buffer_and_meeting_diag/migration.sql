-- Beeminder-style safety buffer for aim derailing.
-- safetyBufferDays: days of slack remaining; starts at 7.
-- safetyBufferUpdatedAt: last recompute timestamp for day-rollover math.
-- derailedAt: set when buffer hits 0; cleared by "back on track" action.
ALTER TABLE "UserAim" ADD COLUMN IF NOT EXISTS "safetyBufferDays" DOUBLE PRECISION NOT NULL DEFAULT 7;
ALTER TABLE "UserAim" ADD COLUMN IF NOT EXISTS "safetyBufferUpdatedAt" TIMESTAMP(3);
ALTER TABLE "UserAim" ADD COLUMN IF NOT EXISTS "derailedAt" TIMESTAMP(3);

-- Meeting diagnostics: which Google calendar the event was written to + web link.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "calendarIdUsed" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "htmlLink" TEXT;
