-- Component 20: Add AimInvitation and WorkBlockInvitation tables with InviteStatus enum.
-- Additive only — no existing tables modified.

-- Create InviteStatus enum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- Create AimInvitation table
CREATE TABLE "AimInvitation" (
    "id"            TEXT NOT NULL,
    "aimInstanceId" TEXT NOT NULL,
    "inviterId"     TEXT NOT NULL,
    "inviteeId"     TEXT NOT NULL,
    "status"        "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt"   TIMESTAMP(3),

    CONSTRAINT "AimInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AimInvitation_aimInstanceId_inviteeId_key" ON "AimInvitation"("aimInstanceId", "inviteeId");
CREATE INDEX "AimInvitation_inviteeId_idx" ON "AimInvitation"("inviteeId");

ALTER TABLE "AimInvitation" ADD CONSTRAINT "AimInvitation_aimInstanceId_fkey"
    FOREIGN KEY ("aimInstanceId") REFERENCES "AimInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create WorkBlockInvitation table
CREATE TABLE "WorkBlockInvitation" (
    "id"          TEXT NOT NULL,
    "workBlockId" TEXT NOT NULL,
    "inviterId"   TEXT NOT NULL,
    "inviteeId"   TEXT NOT NULL,
    "status"      "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "WorkBlockInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkBlockInvitation_workBlockId_inviteeId_key" ON "WorkBlockInvitation"("workBlockId", "inviteeId");
CREATE INDEX "WorkBlockInvitation_inviteeId_idx" ON "WorkBlockInvitation"("inviteeId");

ALTER TABLE "WorkBlockInvitation" ADD CONSTRAINT "WorkBlockInvitation_workBlockId_fkey"
    FOREIGN KEY ("workBlockId") REFERENCES "WorkBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
