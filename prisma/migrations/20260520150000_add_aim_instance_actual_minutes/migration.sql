-- AddColumn: actualMinutes to AimInstance
-- Backward-compatible: nullable integer; null means "use scheduled duration".
-- Mirrors WorkBlock.actualMinutes for completion-review logging.

ALTER TABLE "AimInstance" ADD COLUMN IF NOT EXISTS "actualMinutes" INTEGER;
