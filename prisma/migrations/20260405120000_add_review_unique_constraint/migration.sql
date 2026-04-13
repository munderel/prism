-- Deduplicate Review rows before adding unique constraint (keep most recently updated)
DELETE FROM "Review"
WHERE id NOT IN (
  SELECT DISTINCT ON ("userId", "reviewType", "scheduledDate") id
  FROM "Review"
  ORDER BY "userId", "reviewType", "scheduledDate", "updatedAt" DESC
);

-- CreateIndex (safe)
CREATE UNIQUE INDEX IF NOT EXISTS "Review_userId_reviewType_scheduledDate_key"
  ON "Review"("userId", "reviewType", "scheduledDate");
