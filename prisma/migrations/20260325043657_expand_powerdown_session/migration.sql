-- AlterTable
ALTER TABLE "PowerdownSession" ADD COLUMN     "clearGoals" JSONB,
ADD COLUMN     "distractions" JSONB,
ADD COLUMN     "gratitudes" JSONB,
ADD COLUMN     "ideas" JSONB;
