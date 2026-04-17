-- Non-destructive: new table for meal / eating time blocks on the calendar.

CREATE TABLE IF NOT EXISTS "FoodBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FoodBlock_userId_startAt_idx" ON "FoodBlock"("userId", "startAt");

ALTER TABLE "FoodBlock" ADD CONSTRAINT "FoodBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
