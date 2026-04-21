-- Add optional owner to Kpi. Null = team-shared (default, matches prior
-- behavior). Set null on user delete so the KPI becomes team-owned rather than
-- breaking the row.

ALTER TABLE "Kpi" ADD COLUMN "ownerId" TEXT;

ALTER TABLE "Kpi"
  ADD CONSTRAINT "Kpi_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Kpi_ownerId_idx" ON "Kpi"("ownerId");
