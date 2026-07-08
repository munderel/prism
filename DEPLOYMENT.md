# Prism Deployment Checklist & API Key Guide

## Context
Prism is feature-complete and ready for production deployment on Vercel. The codebase has no TODOs or placeholder code. What remains is infrastructure setup, third-party service configuration, and environment variable provisioning.

---

## Phase 1: Generate Secrets (Local Machine)

Run these commands to generate all needed secrets:

```bash
# 1. NextAuth session signing key
openssl rand -base64 32
# → Save as NEXTAUTH_SECRET

# 2. Cron endpoint authentication secret
openssl rand -base64 32
# → Save as CRON_SECRET

# 3. Token encryption key (64-char hex for AES-256-GCM)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → Save as TOKEN_ENCRYPTION_KEY

# 4. VAPID keys for web push notifications
npx web-push generate-vapid-keys
# → Save public key as VAPID_PUBLIC_KEY
# → Save private key as VAPID_PRIVATE_KEY
```

---

## Phase 2: Set Up Google Cloud Project

This is the biggest setup — it powers both login AND calendar sync.

### Step 1: Create Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g., "Prism Production")

### Step 2: Enable APIs
1. Go to **APIs & Services → Library**
2. Search and enable: **Google Calendar API**

### Step 3: Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** user type (or Internal if using Google Workspace)
3. Fill in:
   - App name: `Prism`
   - User support email: your email
   - Authorized domains: your production domain (e.g., `upwhiten.com`)
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`

   The app deliberately does NOT request the broad `auth/calendar` scope
   (which also grants ACL/sharing and calendar create/delete) — it only
   needs event read/write plus a read-only calendar list.

   > **Migrating from the old full `auth/calendar` scope:** users who
   > connected Google before the narrowing keep their old broad grant
   > until they reconnect. Sync keeps working either way; to drop the
   > broad grant, a user can disconnect and re-link Google (or revoke
   > Prism at <https://myaccount.google.com/permissions> and sign in with
   > Google again) — the new consent screen will only ask for
   > "View and edit events" + "See your calendars".
5. Add test users if in "Testing" mode (required before publishing)

### Step 4: Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
5. Copy:
   - **Client ID** → `GOOGLE_CLIENT_ID`
   - **Client Secret** → `GOOGLE_CLIENT_SECRET`

### Step 5: Publish OAuth App (when ready for all users)
- Go back to OAuth consent screen → click **Publish App**
- Without publishing, only test users can log in

---

## Phase 3: Set Up Production Database

### Option A: Vercel Postgres (simplest)
1. In Vercel dashboard → Storage → Create Database → Postgres
2. Copy the connection string → `DATABASE_URL`

### Option B: Neon / Supabase / Railway
1. Create a PostgreSQL instance
2. Copy connection string in format: `postgresql://user:password@host:5432/dbname`
3. Ensure SSL is enabled (append `?sslmode=require` if needed)

### Run Migrations
```bash
DATABASE_URL="your-production-url" npx prisma migrate deploy
```

### Seed Initial Data (optional)
```bash
DATABASE_URL="your-production-url" npx prisma db seed
```

---

## Phase 4: Set Up Email (SMTP)

### Option A: Gmail SMTP (quick start)
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=your-gmail@gmail.com`
- `SMTP_PASS=` (use an [App Password](https://myaccount.google.com/apppasswords), NOT your Gmail password)
- `SMTP_FROM=noreply@upwhiten.com` (or your preferred sender)

### Option B: SendGrid / Resend / Postmark
- Create account, get SMTP credentials
- Fill in host/port/user/pass accordingly

Used for: review nag emails, derailing alerts, invitation emails, mention notifications.

---

## Phase 5: Set Up OpenRouter (AI Features)

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create account → go to API Keys
3. Create a new key
4. Copy → `OPENROUTER_API_KEY` (starts with `sk-or-`)
5. Optional: `OPENROUTER_MODEL=meta-llama/llama-3-70b-instruct` (this is the default)

Used for: AI quiz generation in training, AI task suggestions.

---

## Phase 6: Deploy to Vercel

### Step 1: Connect Repository
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your Git repository
3. Framework: Next.js (auto-detected)

### Step 2: Add All Environment Variables
In Vercel → Project Settings → Environment Variables, add:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Your production PostgreSQL connection string | YES |
| `NEXTAUTH_URL` | `https://your-domain.com` | YES |
| `NEXTAUTH_SECRET` | Generated in Phase 1 | YES |
| `GOOGLE_CLIENT_ID` | From Phase 2 | YES |
| `GOOGLE_CLIENT_SECRET` | From Phase 2 | YES |
| `CRON_SECRET` | Generated in Phase 1 | YES |
| `TOKEN_ENCRYPTION_KEY` | Generated in Phase 1 | YES |
| `SMTP_HOST` | From Phase 4 | For email features |
| `SMTP_PORT` | From Phase 4 | For email features |
| `SMTP_USER` | From Phase 4 | For email features |
| `SMTP_PASS` | From Phase 4 | For email features |
| `SMTP_FROM` | e.g., `noreply@upwhiten.com` | For email features |
| `VAPID_PUBLIC_KEY` | Generated via `npx web-push generate-vapid-keys` | For web push (server-side signing) |
| `VAPID_PRIVATE_KEY` | Generated via `npx web-push generate-vapid-keys` | For web push (server-side signing) |
| `VAPID_EMAIL` | Your admin email, e.g. `admin@yourapp.com` | Web-push contact email (required by the standard) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY` | Historically exposed to the browser for `pushManager.subscribe`. The settings page and subscribe flow now fetch the key via `/api/notifications/public-key` (server-rendered), so this var is no longer strictly required, but set it for parity with the example file. |
| `OPENROUTER_API_KEY` | From Phase 5 | For AI features |
| `NEXT_PUBLIC_DEV_LOGIN` | `false` (or don't set it) | N/A |

### Step 3: Deploy
- Trigger deploy (Vercel auto-builds with `next build`)
- Cron runs from **GitHub Actions**, not Vercel. Four workflows in `.github/workflows/` call the endpoints on a schedule:
  - `derailing.yml` → `/api/cron/derailing` — hourly 18:00–23:00 UTC
  - `meeting-reminders.yml` → `/api/cron/meeting-reminders` — every 5 min
  - `review-nag.yml` → `/api/cron/review-nag` — daily 13:00 UTC
  - `google-sync.yml` → `/api/cron/google-sync` — every 15 min
- The workflows require two **GitHub Actions secrets** on the repo: `CRON_SECRET` (same value as the Vercel env var) and `PRODUCTION_URL` (e.g. `https://your-domain.com`). A workflow is only active once merged to the default branch.

### Step 4: Custom Domain (optional)
1. Vercel → Project Settings → Domains
2. Add your domain
3. Update DNS records as instructed
4. Update `NEXTAUTH_URL` to match
5. Update Google OAuth redirect URI to match

---

## Phase 7: Post-Deploy Verification

- [ ] Visit the app URL — login page loads
- [ ] Google OAuth login works (redirects to Google, returns to app)
- [ ] Dashboard loads with no errors
- [ ] Create a task with time blocks → check it appears in Google Calendar
- [ ] Calendar page shows both internal events and Google Calendar events
- [ ] Complete a task → Google Calendar event is deleted
- [ ] Check GitHub Actions runs for cron workflow execution (repo → Actions tab)
- [ ] Send a test email notification (if SMTP configured)
- [ ] Test push notification subscription (if VAPID configured)
- [ ] AI quiz generation works in Training (if OpenRouter configured)
- [ ] Disable dev login confirmed (`NEXT_PUBLIC_DEV_LOGIN` is not `true`)

---

## Quick Reference: Where Each Env Var Is Used

| Variable | Files |
|----------|-------|
| `DATABASE_URL` | `src/lib/prisma.ts`, `prisma/schema.prisma` |
| `NEXTAUTH_*` | `src/lib/auth.ts` |
| `GOOGLE_CLIENT_*` | `src/lib/auth.ts`, `src/lib/calendar.ts` |
| `TOKEN_ENCRYPTION_KEY` | `src/lib/crypto.ts`, `src/lib/auth.ts`, `src/lib/calendar.ts` |
| `CRON_SECRET` | `src/lib/auth-guard.ts` |
| `SMTP_*` | `src/lib/notifications.ts` |
| `VAPID_*` | `src/lib/notifications.ts` |
| `OPENROUTER_*` | `src/lib/openrouter.ts` |
| `NEXT_PUBLIC_DEV_LOGIN` | `src/lib/auth.ts`, `src/app/(auth)/login/page.tsx` |
