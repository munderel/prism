-- Partial 2 — defensive backfill of DeliverableItem rows from Task.description.
--
-- Background: an earlier migration (20260520230000_drop_legacy_columns.sql)
-- dropped Task.deliverable / Task.deliverableDone before the legacy free-text
-- contents were converted into structured DeliverableItem rows. The production
-- text is already gone; this migration is a defensive heuristic that converts
-- any bullet-list-shaped Task.description into DeliverableItem rows for tasks
-- that still have zero DeliverableItem rows. It is intentionally conservative:
-- a description must contain TWO OR MORE bullet-pattern lines before any rows
-- are emitted, so prose paragraphs that happen to start with `-` or `*` are
-- left alone.
--
-- Idempotency: the `NOT EXISTS (SELECT 1 FROM "DeliverableItem" ...)` guard on
-- the candidates CTE means a second run inserts zero rows — once a task has
-- any DeliverableItem row (from this migration, the UI, or any other source)
-- it is permanently excluded from future runs of this backfill.
--
-- Safety: this migration is INSERT-only. No DDL, no UPDATE, no DELETE. It is
-- backwards-compatible with the currently-deployed code (DeliverableItem is
-- already wired up in the API and UI).
--
-- ID generation: DeliverableItem.id is declared `@default(cuid())` in
-- prisma/schema.prisma, which is a JS-side default — the database column is
-- plain TEXT with no constraint on cuid shape. Following the precedent set by
-- 20260419130000_add_work_blocks/migration.sql and
-- 20260520225000_backfill_notification_channel_prefs/migration.sql, we use
-- `gen_random_uuid()::text`. The string won't match the cuid format but
-- Postgres/Prisma accept any unique text value here.
--
-- Bullet patterns detected (per line, leading whitespace ignored):
--   - markdown bullets:   `- ` / `* ` / `• `
--   - markdown checkboxes: `[ ]` (isDone=false) / `[x]` (isDone=true)
--   - numbered lists:     `1.` / `2.` / ... (one-or-more digits + dot)
-- The trailing `\S` anchor in the regex requires non-whitespace content after
-- the prefix, so lines like `- ` (empty bullet) are rejected.
--
-- Filter scope: any Task (regardless of taskType) that has a non-null
-- description and zero DeliverableItem rows. The original Task.deliverable
-- field was on the Task model itself, not gated to a specific type — the
-- current TaskType enum (IMPROVE/REACT/MAINTENANCE/REVIEW) has no
-- DELIVERABLE label, and the UI renders deliverableItems for any task type.
-- The 2-or-more-bullet-line heuristic in the `counted` CTE is the actual
-- defense against false positives; prose paragraphs with a stray `-` line
-- are left untouched.

WITH candidates AS (
  SELECT t."id", t."description"
  FROM "Task" t
  WHERE t."description" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "DeliverableItem" d WHERE d."taskId" = t."id"
    )
),
parsed AS (
  SELECT c."id" AS task_id, s.line, s.ord
  FROM candidates c,
       LATERAL unnest(regexp_split_to_array(c."description", E'\n'))
              WITH ORDINALITY AS s(line, ord)
  WHERE s.line ~ '^\s*([-*•]|\[[ xX]\]|\d+\.)\s+\S'
),
counted AS (
  SELECT task_id FROM parsed GROUP BY task_id HAVING COUNT(*) >= 2
),
numbered AS (
  SELECT
    p.task_id,
    p.line,
    ROW_NUMBER() OVER (PARTITION BY p.task_id ORDER BY p.ord) - 1 AS position_idx
  FROM parsed p
  WHERE p.task_id IN (SELECT task_id FROM counted)
)
INSERT INTO "DeliverableItem" ("id", "taskId", "text", "isDone", "position", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  n.task_id,
  trim(regexp_replace(n.line, '^\s*([-*•]|\[[ xX]\]|\d+\.)\s+', '')),
  (n.line ~* '^\s*\[x\]'),
  n.position_idx::int,
  NOW(),
  NOW()
FROM numbered n;
