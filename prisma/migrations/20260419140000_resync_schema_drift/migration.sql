-- Resync schema drift: schema.prisma contained additive fields not covered by any
-- migration. All changes are additive (nullable or defaulted) — no data loss risk.

-- AlterEnum
ALTER TYPE "KpiType" ADD VALUE 'PERCENTAGE';

-- AlterTable
ALTER TABLE "AimCategory" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isUserHabit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProcessKpi" ADD COLUMN     "type" "KpiType" NOT NULL DEFAULT 'NUMERIC';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deliverableDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "successCriteria" JSONB;

-- CreateIndex
CREATE INDEX "AimCategory_createdByUserId_idx" ON "AimCategory"("createdByUserId");

-- AddForeignKey
ALTER TABLE "AimCategory" ADD CONSTRAINT "AimCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
