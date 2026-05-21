-- 19b prerequisite: backfill NotificationChannelPref rows from the (still
-- present at this point) NotificationPreference flat-flag columns BEFORE the
-- next migration drops them.
--
-- This migration was added after the fact when the standalone backfill script
-- (scripts/backfill-notification-channel-prefs.ts) was deleted in PR #54 and
-- the gap analysis flagged that without it the column drop loses every user's
-- preferences. By running it inside `prisma migrate deploy`, the backfill is
-- guaranteed to execute before the column drop in the same migrate run.
--
-- The flat-flag columns referenced here (`emailEnabled`, `pushEnabled`,
-- `derailingAlerts`, `mentionAlerts`, `reviewNags`, `meetingReminders`) still
-- exist in the production DB at this point — they are dropped in the next
-- migration (`20260520230000_drop_legacy_columns`). Prisma applies migrations
-- in lexicographic order, so this runs first.
--
-- Idempotent via ON CONFLICT DO NOTHING against the @@unique([userId, notifType, channel]).
-- Safe to re-apply (no-op on a second run).
--
-- Semantics (mirrors the original TypeScript backfill from PR #51):
--   - IN_APP channel: always enabled (matches opt-in-by-default).
--   - EMAIL channel: enabled if emailEnabled AND the type's flag is true.
--   - PUSH_DESKTOP / PUSH_MOBILE: enabled if pushEnabled AND the type's flag.
--   - GENERIC / AIM_INVITE / WORKBLOCK_INVITE types default to all channels
--     enabled (no historical flag governs them; matches new-user defaults).

-- ── DERAILING ─────────────────────────────────────────────────────────────────
INSERT INTO "NotificationChannelPref" ("id", "userId", "notifType", "channel", "enabled")
SELECT
  gen_random_uuid()::text,
  "userId",
  'DERAILING'::"NotificationType",
  ch.channel,
  CASE ch.channel
    WHEN 'IN_APP'::"NotificationChannel" THEN true
    WHEN 'EMAIL'::"NotificationChannel" THEN ("emailEnabled" AND "derailingAlerts")
    WHEN 'PUSH_DESKTOP'::"NotificationChannel" THEN ("pushEnabled" AND "derailingAlerts")
    WHEN 'PUSH_MOBILE'::"NotificationChannel" THEN ("pushEnabled" AND "derailingAlerts")
  END
FROM "NotificationPreference"
CROSS JOIN (VALUES
  ('IN_APP'::"NotificationChannel"),
  ('EMAIL'::"NotificationChannel"),
  ('PUSH_DESKTOP'::"NotificationChannel"),
  ('PUSH_MOBILE'::"NotificationChannel")
) AS ch(channel)
ON CONFLICT ("userId", "notifType", "channel") DO NOTHING;

-- ── MENTION ───────────────────────────────────────────────────────────────────
INSERT INTO "NotificationChannelPref" ("id", "userId", "notifType", "channel", "enabled")
SELECT
  gen_random_uuid()::text,
  "userId",
  'MENTION'::"NotificationType",
  ch.channel,
  CASE ch.channel
    WHEN 'IN_APP'::"NotificationChannel" THEN true
    WHEN 'EMAIL'::"NotificationChannel" THEN ("emailEnabled" AND "mentionAlerts")
    WHEN 'PUSH_DESKTOP'::"NotificationChannel" THEN ("pushEnabled" AND "mentionAlerts")
    WHEN 'PUSH_MOBILE'::"NotificationChannel" THEN ("pushEnabled" AND "mentionAlerts")
  END
FROM "NotificationPreference"
CROSS JOIN (VALUES
  ('IN_APP'::"NotificationChannel"),
  ('EMAIL'::"NotificationChannel"),
  ('PUSH_DESKTOP'::"NotificationChannel"),
  ('PUSH_MOBILE'::"NotificationChannel")
) AS ch(channel)
ON CONFLICT ("userId", "notifType", "channel") DO NOTHING;

-- ── REVIEW_NAG ────────────────────────────────────────────────────────────────
INSERT INTO "NotificationChannelPref" ("id", "userId", "notifType", "channel", "enabled")
SELECT
  gen_random_uuid()::text,
  "userId",
  'REVIEW_NAG'::"NotificationType",
  ch.channel,
  CASE ch.channel
    WHEN 'IN_APP'::"NotificationChannel" THEN true
    WHEN 'EMAIL'::"NotificationChannel" THEN ("emailEnabled" AND "reviewNags")
    WHEN 'PUSH_DESKTOP'::"NotificationChannel" THEN ("pushEnabled" AND "reviewNags")
    WHEN 'PUSH_MOBILE'::"NotificationChannel" THEN ("pushEnabled" AND "reviewNags")
  END
FROM "NotificationPreference"
CROSS JOIN (VALUES
  ('IN_APP'::"NotificationChannel"),
  ('EMAIL'::"NotificationChannel"),
  ('PUSH_DESKTOP'::"NotificationChannel"),
  ('PUSH_MOBILE'::"NotificationChannel")
) AS ch(channel)
ON CONFLICT ("userId", "notifType", "channel") DO NOTHING;

-- ── MEETING_REMINDER ──────────────────────────────────────────────────────────
INSERT INTO "NotificationChannelPref" ("id", "userId", "notifType", "channel", "enabled")
SELECT
  gen_random_uuid()::text,
  "userId",
  'MEETING_REMINDER'::"NotificationType",
  ch.channel,
  CASE ch.channel
    WHEN 'IN_APP'::"NotificationChannel" THEN true
    WHEN 'EMAIL'::"NotificationChannel" THEN ("emailEnabled" AND "meetingReminders")
    WHEN 'PUSH_DESKTOP'::"NotificationChannel" THEN ("pushEnabled" AND "meetingReminders")
    WHEN 'PUSH_MOBILE'::"NotificationChannel" THEN ("pushEnabled" AND "meetingReminders")
  END
FROM "NotificationPreference"
CROSS JOIN (VALUES
  ('IN_APP'::"NotificationChannel"),
  ('EMAIL'::"NotificationChannel"),
  ('PUSH_DESKTOP'::"NotificationChannel"),
  ('PUSH_MOBILE'::"NotificationChannel")
) AS ch(channel)
ON CONFLICT ("userId", "notifType", "channel") DO NOTHING;

-- ── AIM_INVITE / WORKBLOCK_INVITE / GENERIC ───────────────────────────────────
-- No historical flag controls these. Match opt-in-by-default: enable all channels.
INSERT INTO "NotificationChannelPref" ("id", "userId", "notifType", "channel", "enabled")
SELECT
  gen_random_uuid()::text,
  "userId",
  t.notif_type,
  ch.channel,
  true
FROM "NotificationPreference"
CROSS JOIN (VALUES
  ('AIM_INVITE'::"NotificationType"),
  ('WORKBLOCK_INVITE'::"NotificationType"),
  ('GENERIC'::"NotificationType")
) AS t(notif_type)
CROSS JOIN (VALUES
  ('IN_APP'::"NotificationChannel"),
  ('EMAIL'::"NotificationChannel"),
  ('PUSH_DESKTOP'::"NotificationChannel"),
  ('PUSH_MOBILE'::"NotificationChannel")
) AS ch(channel)
ON CONFLICT ("userId", "notifType", "channel") DO NOTHING;
