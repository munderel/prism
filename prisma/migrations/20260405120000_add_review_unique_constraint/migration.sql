-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_reviewType_scheduledDate_key" ON "Review"("userId", "reviewType", "scheduledDate");
