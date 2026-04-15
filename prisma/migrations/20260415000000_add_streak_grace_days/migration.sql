-- Add streak grace day toggle to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakGraceDays" BOOLEAN NOT NULL DEFAULT false;
