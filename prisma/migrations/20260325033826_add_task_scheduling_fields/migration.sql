-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "estimatedMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "isAutoScheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredTimeEnd" TEXT,
ADD COLUMN     "preferredTimeStart" TEXT;
