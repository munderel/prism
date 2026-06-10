-- Repair drift between schema.prisma and long-lived databases.
--
-- 1) User.alwaysPromptForBlockObjective was added to schema.prisma in 7461ec7
--    (work-block UX overhaul) without a checked-in migration; production
--    received it via `prisma db push`, but any database rebuilt from the
--    migration history lacks it and every `prisma.user.*` query fails.
--    IF NOT EXISTS makes this a no-op where the column already exists.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "alwaysPromptForBlockObjective" BOOLEAN NOT NULL DEFAULT false;

-- 2) Align the User.defaultWorkBlockMinutes default with the schema (DEFAULT 90);
--    production drifted (introspection shows no/different default). Idempotent.
ALTER TABLE "User" ALTER COLUMN "defaultWorkBlockMinutes" SET DEFAULT 90;
