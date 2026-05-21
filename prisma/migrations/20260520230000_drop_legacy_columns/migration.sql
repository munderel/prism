-- Component 22 (10b + 13b + 19b): Drop legacy columns no longer used by application code.
--
-- PRODUCTION PREREQUISITE (19b):
--   Before deploying this migration, run the NotificationChannelPref backfill
--   against production from a commit on or before PR #54. The script
--   (scripts/backfill-notification-channel-prefs.ts) is removed in this PR
--   because it references the columns being dropped — keeping it would break
--   `tsc --noEmit`. The script was idempotent; running it once from an earlier
--   commit is sufficient. After running the backfill, verify with
--   `npx prisma studio` that NotificationChannelPref rows exist for every
--   user before applying this migration in production.
--
-- 10b: Drop Task.deliverable and Task.deliverableDone
--   Replaced by the DeliverableItem table (Component 10).
--   The free-text deliverable field has been removed from all API routes, TaskEditor,
--   and TaskCard. WorkBlock main-objective seeding now uses the first DeliverableItem.
--
-- 13b: Drop Task.preferredTimeStart and Task.preferredTimeEnd
--   These "preferred scheduling window" fields were removed from the scheduling engine
--   and all API routes in this cleanup sweep.
--
-- 19b: Drop NotificationPreference flat flag columns
--   Replaced by NotificationChannelPref (per-type × per-channel) rows.
--   All cron routes and notifyUser() now gate exclusively via NotificationChannelPref.

-- 10b: Task.deliverable, Task.deliverableDone
ALTER TABLE "Task" DROP COLUMN IF EXISTS "deliverable";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "deliverableDone";

-- 13b: Task.preferredTimeStart, Task.preferredTimeEnd
ALTER TABLE "Task" DROP COLUMN IF EXISTS "preferredTimeStart";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "preferredTimeEnd";

-- 19b: NotificationPreference flat flag columns
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "emailEnabled";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "pushEnabled";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "derailingAlerts";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "mentionAlerts";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "reviewNags";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "meetingReminders";
