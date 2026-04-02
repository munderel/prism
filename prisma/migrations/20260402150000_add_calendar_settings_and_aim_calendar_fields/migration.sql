-- Add missing User fields used by settings/calendar pages.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isPublicOnLeaderboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "syncTargetCalendarId" TEXT,
ADD COLUMN IF NOT EXISTS "calendarColorOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS "weeklyReviewDayOfWeek" INTEGER,
ADD COLUMN IF NOT EXISTS "weeklyReviewTime" TEXT,
ADD COLUMN IF NOT EXISTS "weeklyReviewDuration" INTEGER,
ADD COLUMN IF NOT EXISTS "monthlyReviewRecurrenceRule" TEXT,
ADD COLUMN IF NOT EXISTS "monthlyReviewTime" TEXT,
ADD COLUMN IF NOT EXISTS "monthlyReviewDuration" INTEGER,
ADD COLUMN IF NOT EXISTS "yearlyReviewRecurrenceRule" TEXT,
ADD COLUMN IF NOT EXISTS "yearlyReviewTime" TEXT,
ADD COLUMN IF NOT EXISTS "yearlyReviewDuration" INTEGER;

-- Add missing AimInstance field used by AIM/calendar sync routes.
ALTER TABLE "AimInstance"
ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT;
