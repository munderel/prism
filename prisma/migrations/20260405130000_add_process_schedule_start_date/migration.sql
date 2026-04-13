-- AlterTable (safe)
ALTER TABLE "Process" ADD COLUMN IF NOT EXISTS "scheduleStartDate" TIMESTAMP(3);
