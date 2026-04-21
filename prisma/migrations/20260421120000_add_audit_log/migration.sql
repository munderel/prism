-- Append-only audit trail for high-blast-radius actions (admin deletes, bulk
-- ops, streak resets, destructive cron runs). actorId is nullable to cover
-- system/cron actions and to survive user deletion via SET NULL.

CREATE TABLE "AuditLog" (
  "id"         TEXT        NOT NULL,
  "actorId"    TEXT,
  "action"     TEXT        NOT NULL,
  "targetType" TEXT        NOT NULL,
  "targetId"   TEXT,
  "metadata"   JSONB,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AuditLog_actorId_createdAt_idx"    ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx"  ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_action_createdAt_idx"     ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx"            ON "AuditLog"("createdAt");
