-- Add a unique constraint on (reviewId, stepKey) so concurrent POSTs to
-- /api/reviews/[id]/answers cannot create duplicate rows. Before enforcing,
-- dedupe any pre-existing duplicates by keeping the most-recently-updated row.

-- 1. Dedupe existing rows.
DELETE FROM "ReviewAnswer" a
USING "ReviewAnswer" b
WHERE a."reviewId" = b."reviewId"
  AND a."stepKey"  = b."stepKey"
  AND a."updatedAt" < b."updatedAt";

-- 2. Enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewAnswer_reviewId_stepKey_key"
  ON "ReviewAnswer"("reviewId", "stepKey");
