-- Daily hours target shown in Powerdown Step 4 header. Stored as minutes
-- (Int) to avoid float drift; UI converts to hours for display. Nullable
-- so existing users default to "no target set" → header hidden. Set from
-- the Settings page.
ALTER TABLE "User" ADD COLUMN "dailyHoursTarget" INTEGER;
