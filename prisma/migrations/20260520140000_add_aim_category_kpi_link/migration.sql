-- AddColumn: linkedKpiId and kpiIncrement to AimCategory
-- Backward-compatible: both columns are nullable; no existing rows are touched.

ALTER TABLE "AimCategory" ADD COLUMN "linkedKpiId" TEXT;
ALTER TABLE "AimCategory" ADD COLUMN "kpiIncrement" DOUBLE PRECISION;

-- FK: linkedKpiId → Kpi.id; SET NULL on delete so deleting a KPI
-- automatically unlinks all AimCategories that pointed to it.
ALTER TABLE "AimCategory" ADD CONSTRAINT "AimCategory_linkedKpiId_fkey"
  FOREIGN KEY ("linkedKpiId") REFERENCES "Kpi"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for FK lookup (avoids sequential scans when Kpi is deleted)
CREATE INDEX "AimCategory_linkedKpiId_idx" ON "AimCategory"("linkedKpiId");
