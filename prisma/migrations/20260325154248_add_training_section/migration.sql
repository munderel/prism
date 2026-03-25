-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('BOOK', 'COURSE');

-- CreateTable
CREATE TABLE "TrainingItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "TrainingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "uploadedFileUrl" TEXT,
    "aiMetadata" JSONB,
    "targetCompletionDate" TIMESTAMP(3),
    "goalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTask" (
    "id" TEXT NOT NULL,
    "trainingItemId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "chapterRange" TEXT,
    "moduleIndex" INTEGER,
    "isQuizDay" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "trainingItemId" TEXT NOT NULL,
    "trainingTaskId" TEXT,
    "questions" JSONB NOT NULL,
    "userAnswers" JSONB,
    "score" DOUBLE PRECISION,
    "llmFeedback" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingItem_ownerId_idx" ON "TrainingItem"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTask_taskId_key" ON "TrainingTask"("taskId");

-- CreateIndex
CREATE INDEX "TrainingTask_trainingItemId_idx" ON "TrainingTask"("trainingItemId");

-- CreateIndex
CREATE INDEX "QuizAttempt_trainingItemId_idx" ON "QuizAttempt"("trainingItemId");

-- AddForeignKey
ALTER TABLE "TrainingItem" ADD CONSTRAINT "TrainingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingItem" ADD CONSTRAINT "TrainingItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_trainingItemId_fkey" FOREIGN KEY ("trainingItemId") REFERENCES "TrainingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_trainingItemId_fkey" FOREIGN KEY ("trainingItemId") REFERENCES "TrainingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
