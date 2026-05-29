-- Issue 11: collapse goal-stack scope to a binary Company vs Personal model.
-- Any stack that was shared via the legacy `visibility` field ('company' or
-- 'group') becomes a company stack (isCompany = true, visible to everyone).
-- Personal stacks remain isCompany = false (owner-only). The `visibility`
-- column is retained (no destructive drop) but is no longer read for access
-- control — isCompany is now the single source of truth.
UPDATE "GoalStack"
SET "isCompany" = true,
    "visibility" = 'company'
WHERE "isCompany" = false
  AND "visibility" IN ('company', 'group');

-- Keep the column self-consistent for any remaining rows: company stacks read
-- 'company', everything else 'private'.
UPDATE "GoalStack"
SET "visibility" = 'company'
WHERE "isCompany" = true AND "visibility" <> 'company';

UPDATE "GoalStack"
SET "visibility" = 'private'
WHERE "isCompany" = false AND "visibility" <> 'private';
