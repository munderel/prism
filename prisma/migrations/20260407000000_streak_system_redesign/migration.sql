-- Add isActive flag to Streak (default true keeps all existing streaks active)
ALTER TABLE "Streak" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Add master streak config fields to User (all default true)
ALTER TABLE "User" ADD COLUMN "streakCountAims" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "streakCountProcesses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "streakCountReviews" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "streakCountPowerdown" BOOLEAN NOT NULL DEFAULT true;

-- Fix the silent bug: rename broken streak type to the new canonical name
UPDATE "Streak" SET "streakType" = 'daily' WHERE "streakType" = 'daily_completion';
