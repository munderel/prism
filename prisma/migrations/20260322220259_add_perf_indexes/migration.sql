-- CreateIndex
CREATE INDEX "GoalStack_ownerId_idx" ON "GoalStack"("ownerId");

-- CreateIndex
CREATE INDEX "Task_goalId_idx" ON "Task"("goalId");

-- CreateIndex
CREATE INDEX "Task_ownerId_dueDate_idx" ON "Task"("ownerId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_ownerId_status_idx" ON "Task"("ownerId", "status");
