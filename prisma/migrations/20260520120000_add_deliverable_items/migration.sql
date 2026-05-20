-- Add DeliverableItem model — a structured checkbox list replacing the legacy
-- free-text Task.deliverable field (which is kept in place for the two-step
-- rollout; dropping it is Component 10b once Component 13's UI stops reading it).

CREATE TABLE "DeliverableItem" (
    "id"        TEXT NOT NULL,
    "taskId"    TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    "isDone"    BOOLEAN NOT NULL DEFAULT false,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverableItem_pkey" PRIMARY KEY ("id")
);

-- Index for efficient ordered lookups per task
CREATE INDEX "DeliverableItem_taskId_position_idx" ON "DeliverableItem"("taskId", "position");

-- Cascade deletes when the parent task is removed
ALTER TABLE "DeliverableItem" ADD CONSTRAINT "DeliverableItem_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
