-- CreateTable
CREATE TABLE "AimCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultFrequency" INTEGER NOT NULL,
    "defaultDurationMin" INTEGER NOT NULL,
    "isGroupable" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isDaily" BOOLEAN NOT NULL DEFAULT false,
    "activities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AimCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aimCategoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customDuration" INTEGER,
    "customFrequency" INTEGER,
    "customActivities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AimInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aimCategoryId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "timeBlockStart" TIMESTAMP(3),
    "timeBlockEnd" TIMESTAMP(3),
    "isGroupOpen" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "activityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AimInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAim_userId_aimCategoryId_key" ON "UserAim"("userId", "aimCategoryId");

-- CreateIndex
CREATE INDEX "AimInstance_userId_scheduledDate_idx" ON "AimInstance"("userId", "scheduledDate");

-- AddForeignKey
ALTER TABLE "UserAim" ADD CONSTRAINT "UserAim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAim" ADD CONSTRAINT "UserAim_aimCategoryId_fkey" FOREIGN KEY ("aimCategoryId") REFERENCES "AimCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AimInstance" ADD CONSTRAINT "AimInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AimInstance" ADD CONSTRAINT "AimInstance_aimCategoryId_fkey" FOREIGN KEY ("aimCategoryId") REFERENCES "AimCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
