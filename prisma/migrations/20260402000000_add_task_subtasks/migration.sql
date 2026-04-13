-- AlterTable (safe: skip if column already exists)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- CreateIndex (safe: skip if index already exists)
CREATE INDEX IF NOT EXISTS "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey (safe: skip if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_parentId_fkey'
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Task"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
