-- AlterTable (safe)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSyncState" JSONB NOT NULL DEFAULT '{}';
