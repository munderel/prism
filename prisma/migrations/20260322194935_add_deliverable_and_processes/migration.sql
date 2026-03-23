-- CreateEnum
CREATE TYPE "ProcessCadence" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deliverable" TEXT;

-- CreateTable
CREATE TABLE "BusinessFunction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "delegateId" TEXT,
    "delegateUntil" TIMESTAMP(3),
    "cadence" "ProcessCadence" NOT NULL,
    "cadenceRule" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessExecution" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "executedById" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Process_functionId_idx" ON "Process"("functionId");

-- CreateIndex
CREATE INDEX "Process_assigneeId_idx" ON "Process"("assigneeId");

-- CreateIndex
CREATE INDEX "Process_nextDueAt_idx" ON "Process"("nextDueAt");

-- CreateIndex
CREATE INDEX "ProcessStep_processId_idx" ON "ProcessStep"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessExecution_taskId_key" ON "ProcessExecution"("taskId");

-- CreateIndex
CREATE INDEX "ProcessExecution_processId_idx" ON "ProcessExecution"("processId");

-- CreateIndex
CREATE INDEX "ProcessExecution_scheduledDate_idx" ON "ProcessExecution"("scheduledDate");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "BusinessFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
