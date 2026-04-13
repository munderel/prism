-- Add isActive flag to Streak (safe)
ALTER TABLE "Streak" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Add master streak config fields to User (safe)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCountAims" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCountProcesses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCountReviews" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCountPowerdown" BOOLEAN NOT NULL DEFAULT true;

-- Fix the silent bug: rename broken streak type to the new canonical name
UPDATE "Streak" SET "streakType" = 'daily' WHERE "streakType" = 'daily_completion';
