-- DropIndex
DROP INDEX "ReviewTemplate_reviewType_key";

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "isTeamReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceDayOfWeek" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReviewTemplate" ADD COLUMN     "isTeamTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTemplate_reviewType_isTeamTemplate_key" ON "ReviewTemplate"("reviewType", "isTeamTemplate");
