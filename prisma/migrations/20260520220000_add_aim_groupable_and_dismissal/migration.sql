-- Component 21: Add AimInstanceDismissal table for ephemeral AIM visibility.
-- Note: AimCategory.isGroupable already exists from the original AIMs migration (20260325043428).
-- Additive only — no existing tables modified.

CREATE TABLE "AimInstanceDismissal" (
    "id"            TEXT NOT NULL,
    "aimInstanceId" TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'NOT_GOING',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AimInstanceDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AimInstanceDismissal_aimInstanceId_userId_key"
    ON "AimInstanceDismissal"("aimInstanceId", "userId");

CREATE INDEX "AimInstanceDismissal_userId_idx"
    ON "AimInstanceDismissal"("userId");

ALTER TABLE "AimInstanceDismissal" ADD CONSTRAINT "AimInstanceDismissal_aimInstanceId_fkey"
    FOREIGN KEY ("aimInstanceId") REFERENCES "AimInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
