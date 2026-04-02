-- Add missing calendarEventId column to Meeting table.
-- This field exists in schema.prisma but was never migrated.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT;
