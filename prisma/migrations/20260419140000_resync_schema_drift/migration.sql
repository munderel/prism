-- Resync schema drift: schema.prisma contained additive fields not covered by any
-- migration. All changes are additive (nullable or defaulted) — no data loss risk.
-- Every statement is idempotent so this can re-apply safely on databases where
-- columns/indexes/constraints already exist (the common case, since the drift
-- was discovered precisely because prod already had these).

-- AlterEnum
ALTER TYPE "KpiType" ADD VALUE IF NOT EXISTS 'PERCENTAGE';

-- AlterTable
ALTER TABLE "AimCategory" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "AimCategory" ADD COLUMN IF NOT EXISTS "isUserHabit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProcessKpi" ADD COLUMN IF NOT EXISTS "type" "KpiType" NOT NULL DEFAULT 'NUMERIC';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deliverableDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "successCriteria" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AimCategory_createdByUserId_idx" ON "AimCategory"("createdByUserId");

-- AddForeignKey (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; guard via DO block)
DO $$
BEGIN
  ALTER TABLE "AimCategory"
    ADD CONSTRAINT "AimCategory_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
