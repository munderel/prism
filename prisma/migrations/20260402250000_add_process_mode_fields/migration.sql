-- CreateEnum
CREATE TYPE "ProcessMode" AS ENUM ('BASIC', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SubtaskMode" AS ENUM ('PAIRED', 'UNPAIRED');

-- AlterTable
ALTER TABLE "Process" ADD COLUMN "mode" "ProcessMode" NOT NULL DEFAULT 'BASIC';
ALTER TABLE "Process" ADD COLUMN "subtaskMode" "SubtaskMode" NOT NULL DEFAULT 'PAIRED';
