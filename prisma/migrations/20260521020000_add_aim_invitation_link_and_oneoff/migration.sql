-- Partial 4: Add linkedUserAimId + isOneOff to AimInvitation so invitees can
-- attribute an invited AIM to one of their existing UserAims, OR attend it
-- as a one-off (no UserAim linkage, no recurring streak math).
-- Additive only — backwards-compatible with deployed code (NULL/false defaults).

ALTER TABLE "AimInvitation"
  ADD COLUMN "linkedUserAimId" TEXT,
  ADD COLUMN "isOneOff"        BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AimInvitation_linkedUserAimId_idx"
  ON "AimInvitation"("linkedUserAimId");

ALTER TABLE "AimInvitation"
  ADD CONSTRAINT "AimInvitation_linkedUserAimId_fkey"
    FOREIGN KEY ("linkedUserAimId") REFERENCES "UserAim"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
