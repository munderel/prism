-- DB-backed rate limiting for high-volume mutation routes (tasks, goals,
-- processes, calendar writes). One row per allowed write, counted per
-- key = "<route>:<userId>" within a sliding window; rows older than 24h are
-- opportunistically purged by src/lib/rate-limit.ts. Additive only — no
-- existing tables touched, no data risk.
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEvent_key_createdAt_idx" ON "RateLimitEvent"("key", "createdAt");
