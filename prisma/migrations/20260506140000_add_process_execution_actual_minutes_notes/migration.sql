-- Backfills the schema-only change from cc866b7 that added two nullable
-- fields to ProcessExecution but never produced a migration. The deployed
-- Prisma client SELECTs both columns via `include`, so production GETs
-- against /api/tasks were 500-ing with P2022 ColumnNotFound until now.

ALTER TABLE "ProcessExecution" ADD COLUMN IF NOT EXISTS "actualMinutes" INTEGER;
ALTER TABLE "ProcessExecution" ADD COLUMN IF NOT EXISTS "notes" TEXT;
