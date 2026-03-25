-- AlterEnum
ALTER TYPE "ProcessCadence" ADD VALUE 'ONE_TIME';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "occurDate" TIMESTAMP(3);
