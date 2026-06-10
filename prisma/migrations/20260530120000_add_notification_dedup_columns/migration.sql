-- Per-target dedup markers so the notification crons stop re-sending the same
-- alert on every fire. Both additive + nullable (no backfill, no data risk):
--   * Task.lastDerailNotifiedAt — the hourly derailing cron notifies a task at
--     most once per the owner's local day instead of up to 6x/evening.
--   * Review.lastNaggedAt — the daily review-nag cron reminds about a missed
--     review at most once per ~day instead of every day for up to 30 days.
ALTER TABLE "Task" ADD COLUMN     "lastDerailNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN     "lastNaggedAt" TIMESTAMP(3);
