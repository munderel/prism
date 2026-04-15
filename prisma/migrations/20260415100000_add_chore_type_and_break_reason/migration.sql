-- Add CHORE to TaskType enum
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'CHORE';

-- Add breakReason to Streak model
ALTER TABLE "Streak" ADD COLUMN IF NOT EXISTS "breakReason" TEXT;
