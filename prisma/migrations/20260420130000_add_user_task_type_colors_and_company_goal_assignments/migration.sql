-- UserTaskTypeColor: per-user overrides of the default task-type color palette.
-- When absent, code falls back to PRISM_COLORS defaults in src/lib/prism-colors.ts.

CREATE TABLE "UserTaskTypeColor" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "itemType"  TEXT NOT NULL,
  "color"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserTaskTypeColor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTaskTypeColor_userId_itemType_key" ON "UserTaskTypeColor"("userId", "itemType");
CREATE INDEX "UserTaskTypeColor_userId_idx" ON "UserTaskTypeColor"("userId");

ALTER TABLE "UserTaskTypeColor"
  ADD CONSTRAINT "UserTaskTypeColor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CompanyGoalAssignment: admin-created mapping of users → company goals.
-- Assigned users (and admins) can log progress and are prompted to report in
-- their weekly review. Unassigned users see company goals read-only.

CREATE TABLE "CompanyGoalAssignment" (
  "id"           TEXT NOT NULL,
  "goalStackId"  TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById" TEXT,
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyGoalAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyGoalAssignment_goalStackId_userId_key" ON "CompanyGoalAssignment"("goalStackId", "userId");
CREATE INDEX "CompanyGoalAssignment_userId_idx" ON "CompanyGoalAssignment"("userId");
CREATE INDEX "CompanyGoalAssignment_goalStackId_idx" ON "CompanyGoalAssignment"("goalStackId");

ALTER TABLE "CompanyGoalAssignment"
  ADD CONSTRAINT "CompanyGoalAssignment_goalStackId_fkey"
  FOREIGN KEY ("goalStackId") REFERENCES "GoalStack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyGoalAssignment"
  ADD CONSTRAINT "CompanyGoalAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
