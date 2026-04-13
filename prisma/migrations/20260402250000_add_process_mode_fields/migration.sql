-- CreateEnum (safe)
DO $$ BEGIN
  CREATE TYPE "ProcessMode" AS ENUM ('BASIC', 'ADVANCED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum (safe)
DO $$ BEGIN
  CREATE TYPE "SubtaskMode" AS ENUM ('PAIRED', 'UNPAIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable (safe)
ALTER TABLE "Process" ADD COLUMN IF NOT EXISTS "mode" "ProcessMode" NOT NULL DEFAULT 'BASIC';
ALTER TABLE "Process" ADD COLUMN IF NOT EXISTS "subtaskMode" "SubtaskMode" NOT NULL DEFAULT 'PAIRED';
