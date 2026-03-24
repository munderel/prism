-- CreateEnum
CREATE TYPE "KpiType" AS ENUM ('NUMERIC', 'BINARY');

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KpiType" NOT NULL,
    "unit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "linkedKpiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kpi_goalId_idx" ON "Kpi"("goalId");

-- CreateIndex
CREATE INDEX "Kpi_linkedKpiId_idx" ON "Kpi"("linkedKpiId");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_goalId_name_key" ON "Kpi"("goalId", "name");

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_linkedKpiId_fkey" FOREIGN KEY ("linkedKpiId") REFERENCES "Kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
