# Prism — Architecture

## High-Level Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌────────────┐
│   Browser    │────▶│  Next.js 14 (App Router)          │────▶│ PostgreSQL │
│  (React 18)  │◀────│                                    │◀────│  (Prisma)  │
│  SWR Cache   │     │  ┌──────────┐  ┌───────────────┐  │     └────────────┘
│  Tailwind    │     │  │  Pages   │  │  API Routes   │  │
│  FullCalendar│     │  │  (app)   │  │  (80+ handlers│  │     ┌────────────┐
│  Framer Mot. │     │  └──────────┘  └───────────────┘  │────▶│ Google     │
└─────────────┘     │  ┌──────────┐  ┌───────────────┐  │◀────│ Calendar   │
                    │  │Middleware│  │  src/lib/      │  │     │ API        │
                    │  │ (auth)   │  │  (32 utils)   │  │     └────────────┘
                    │  └──────────┘  └───────────────┘  │
                    └──────────────────────────────────┘     ┌────────────┐
                              │                             │ OpenRouter  │
                              │  GH Actions Cron (4 jobs)   │ (LLM API)  │
                              └─────────────────────────────└────────────┘
```

**Deployment target:** Vercel (serverless functions, edge middleware, cron jobs)

---

## Application Layers

### 1. Presentation Layer

**Technology:** React 18, Tailwind CSS, Framer Motion, FullCalendar

- Components organized by **feature domain** (not atomic design): `src/components/goals/`, `src/components/tasks/`, etc.
- Shared UI primitives in `src/components/ui/` (Toast, ConfirmDialog)
- Layout components in `src/components/layout/` (MainLayout, Sidebar, TopBar)
- Client-side data fetching via **SWR** with a global provider
- Glass-morphism design system with noise overlay, translucent backgrounds
- Dark/light/system theme via `next-themes`
- Animations via Framer Motion `LazyMotion` with `domAnimation` features
- Virtual scrolling via `@tanstack/react-virtual` for long lists

### 2. Routing Layer

**Technology:** Next.js 14 App Router

**Route groups:**
- `(app)/` — Authenticated pages (dashboard, goals, tasks, calendar, etc.)
- `(auth)/` — Public pages (login, accept-invite)

**Middleware** (`src/middleware.ts`):
- Checks NextAuth JWT token on every request
- Redirects unauthenticated users to `/login` with callback URL
- Same-origin (CSRF) check: rejects `POST`/`PATCH`/`PUT`/`DELETE` to `/api/*` with `403 { error: 'Invalid origin' }` when a present `Origin` header doesn't match the request host (`x-forwarded-host` preferred over `host`) or `NEXTAUTH_URL`'s host. Requests **without** an `Origin` header (curl, server-to-server, cron) are allowed — the check targets browser CSRF, complementing the `SameSite=Lax` session cookie. Helper: `verifyRequestOrigin` in `src/lib/origin-check.ts` (edge-safe, no prisma/node-only imports)
- Excluded paths: `/login`, `/accept-invite`, `/api/auth`, `/api/cron`, `/api/health`, `/api/invitations`, `/api/notifications/public-key`, `/sw.js`, `/_next/*`, `/favicon.ico`. Of these, the admin-only `POST /api/invitations` enforces the same origin check inline in its handler (the route is excluded so the public invite-accept flow keeps working)

**Redirects** (in `next.config.mjs`):
- `/dashboard` &rarr; `/`
- `/power-down` &rarr; `/powerdown`

### 3. API Layer

**Technology:** Next.js Route Handlers (80+ endpoints)

Every API route handler follows a consistent pattern:

```typescript
export async function GET(request: Request) {
  // 1. Auth check
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // 2. Parse request (query params or body)
  const { searchParams } = new URL(request.url);

  // 3. Validate input
  if (!requiredField) return Response.json({ error: '...' }, { status: 400 });

  // 4. Prisma query
  const data = await prisma.model.findMany({ where: { ... } });

  // 5. Return JSON with cache headers
  return Response.json(data, { headers: cacheHeaders() });
}
```

**Helpers** (`src/lib/api-helpers.ts`):
- `pickDefined()` — Build partial update payloads for PATCH
- `parsePagination()` — Parse and clamp `?page=` and `?limit=` params
- `cacheHeaders()` — `Cache-Control: private, max-age=10, stale-while-revalidate=60`
- `notFoundResponse()` / `forbiddenResponse()` — Standard error responses
- `validateIceScores()` / `validateEmail()` — Input validation

### 4. Business Logic Layer

**Technology:** 32 TypeScript utility modules in `src/lib/`

Pure functions shared between API routes and (occasionally) client components:

| Module | Purpose |
|--------|---------|
| `auth.ts` | NextAuth configuration (providers, callbacks, JWT) |
| `auth-guard.ts` | Route protection guards |
| `prisma.ts` | Prisma client singleton |
| `crypto.ts` | AES-256-GCM token encryption |
| `date-utils.ts` | Timezone-safe date handling |
| `calendar.ts` | Google Calendar sync logic |
| `scheduling-engine.ts` | Task auto-scheduling algorithm |
| `process-scheduler.ts` | Recurring process scheduling |
| `progress.ts` | Goal progress cascading (child &rarr; parent) |
| `kpi-progress.ts` | KPI progress calculations |
| `derailing.ts` / `derail-detection.ts` | AIM derail detection |
| `review-dates.ts` | Next review date calculations |
| `recurrence.ts` | RRule parsing for recurring tasks |
| `goal-validation.ts` | Goal hierarchy constraint validation |
| `yaml-handler.ts` | Goal Stack YAML import/export |
| `scoring.ts` | ICE score calculation |
| `aim-phases.ts` | AIM growth phase progression |
| `prism-colors.ts` | Centralized color system |
| `notifications.ts` | Email + push notification dispatch |
| `openrouter.ts` | LLM API client with retry logic |
| `ai-prompts.ts` | AI prompt templates |
| `mention-parser.ts` | @mention parsing in comments |
| `delegation.ts` | Process delegation logic |
| `completion-token.ts` | External task completion tokens |
| `reports.ts` | Report data aggregation |
| `task-helpers.ts` | Task status transitions, Win the Day |
| `fetcher.ts` | SWR fetcher with error handling |
| `api-helpers.ts` | Pagination, validation, cache headers |

### 5. Data Layer

**Technology:** Prisma 7.5, PostgreSQL, `@prisma/adapter-pg`

- Prisma client singleton in `src/lib/prisma.ts`
- `@prisma/adapter-pg` with `pg` driver for serverless connection pooling (max 5 connections)
- 40+ models, 11 enums (see [DATABASE.md](DATABASE.md))
- Indexes on frequently filtered fields (`ownerId`, `dueDate`, `status`, `scheduledDate`)
- Soft deletes for Goals only (via `deletedAt` field)
- JSON fields for flexible data storage (wizard state, settings arrays, activity lists)

---

## Authentication Architecture

### Strategy

**JWT sessions** (not database sessions). Sessions are stored in signed JWT tokens, eliminating per-request DB lookups. The PrismaAdapter is kept for OAuth account linking and user creation, but the Session table is unused.

### Providers

| Provider | Context | Details |
|----------|---------|---------|
| Google OAuth | Primary login | Includes Calendar API scope for sync |
| Password + 2FA | Production alternative | Bcrypt hashing, TOTP via `otplib` |
| Dev Login | Local development only | Passwordless email login, gated behind `NODE_ENV` + `NEXT_PUBLIC_DEV_LOGIN` |

### Token Lifecycle

1. **Sign-in:** `signIn` callback stores Google refresh token (encrypted), checks lockout, auto-promotes first user to admin, processes pending invitations
2. **JWT creation:** `jwt` callback caches `userId` and `isAdmin` in token
3. **Token refresh:** Every 5 minutes, `jwt` callback re-fetches `isAdmin` and `isLockedOut` from DB
4. **Session access:** `session` callback exposes `user.id` and `user.isAdmin` to client
5. **Token expiry:** 30-day max age for persistent sessions

### Auth Guards

All defined in `src/lib/auth-guard.ts`:

| Guard | Returns | Usage |
|-------|---------|-------|
| `requireAuth()` | `{ session, userId }` or `{ error, status: 401 }` | Every authenticated endpoint |
| `requireAdmin()` | Same + 403 if not admin | Admin-only endpoints |
| `requireOwnership(ownerId)` | Same + 403 if not owner/admin | Resource owner endpoints |
| `requireTaskAccess(taskId)` | Same + task object + 404/403 | Task-specific endpoints |
| `checkStackAccess(stack, userId, isAdmin)` | `Response` or `null` | Goal stack operations |
| `requireCronSecret(request)` | `boolean` | Cron job endpoints |

### Google Token Encryption

Google OAuth refresh tokens are encrypted at rest using AES-256-GCM (`src/lib/crypto.ts`):
- Key: `TOKEN_ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- Format: `iv:authTag:ciphertext` (all hex)
- Fallback: Pre-encryption tokens (plaintext) are handled gracefully

### 2FA Flow

1. User enables 2FA via `POST /api/auth/setup-2fa` (generates TOTP secret + QR code)
2. On login, if `is2FAEnabled` is true, server throws `2FA_REQUIRED` error
3. Client shows TOTP input, resubmits with `totpCode`
4. Server verifies TOTP via `otplib.verifySync()`
5. Company can enforce 2FA via `CompanyAuthSettings.enforce2FA`

---

## Data Fetching Strategy

### Server-Side (API Routes)

API routes use Prisma directly. No caching layer — Prisma handles connection pooling.

### Client-Side (SWR)

Global configuration in `src/app/(app)/swr-provider.tsx`:

```typescript
{
  fetcher,                    // Simple fetch wrapper from src/lib/fetcher.ts
  revalidateOnFocus: false,   // Don't refetch on tab focus
  dedupingInterval: 5000,     // Dedupe identical requests within 5s
  errorRetryCount: 2,         // Retry failed requests twice
}
```

**Mutation pattern:**
1. `fetch('/api/...', { method: 'POST', body: JSON.stringify(data) })`
2. Call `mutate('/api/...')` to revalidate the SWR cache
3. UI updates automatically via SWR's reactive cache

**No global state management** (Redux, Context, Zustand). SWR cache is the source of truth. Local component state (`useState`) handles UI concerns (modals, selections, view modes). `localStorage` persists UI preferences (sidebar collapse, focus mode, guide dismissals).

---

## Calendar Integration

### Google Calendar Sync

**Library:** `googleapis` v171.4.0

**How it works:**
1. User signs in with Google OAuth (Calendar scope included)
2. Google refresh token is encrypted and stored on User model
3. When a task gets a time block (`timeBlockStart`/`timeBlockEnd`), Prism creates a Google Calendar event
4. Event includes task title, description, and a "Mark complete in Prism" URL
5. When a task is completed, the corresponding Google Calendar event is deleted
6. Users select which Google Calendars to display via `selectedCalendarIds`

**Sync direction:** Prism &rarr; Google (write tasks/reviews/aims) and Google &rarr; Prism (read external events for display)

**Graceful degradation:** All calendar operations wrap in try/catch. If no Google account is linked, calendar features show only internal events.

### Completion URLs

Each Google Calendar event includes a completion URL token:
- Generated via `src/lib/completion-token.ts`
- When clicked, calls `POST /api/tasks/[id]/complete-external`
- Allows completing tasks from Google Calendar without opening Prism

---

## Design System

### Color System

Centralized in `src/lib/prism-colors.ts`. Eight item types with consistent colors used across calendar, dashboard, reviews, and reports:

| Type | Color | Hex | Tailwind |
|------|-------|-----|----------|
| Improve | Indigo | `#818cf8` | `indigo-400` |
| React | Yellow | `#fbbf24` | `yellow-400` |
| Maintenance | Cyan | `#22d3ee` | `cyan-400` |
| AIM | Teal | `#2dd4bf` | `teal-400` |
| Review | Amber | `#f59e0b` | `amber-400` |
| Google Calendar | Purple | `#a855f7` | `purple-400` |
| Power Down | Violet | `#8b5cf6` | `violet-400` |
| Meeting | Emerald | `#10b981` | `emerald-400` |

Each color definition includes: hex, emoji, translucent background (`rgba`), border, and Tailwind classes (`textClass`, `bgClass`, `borderClass`).

**Usage:** Always import from `prism-colors.ts`. Never hardcode calendar/task colors.

### Visual Language

- **Glass-morphism:** Noise overlay div in `MainLayout.tsx`, translucent backgrounds, backdrop blur
- **Fonts:** Inter + Plus Jakarta Sans via `next/font`
- **Theme:** Light/Dark/System via `next-themes` (`ThemeProvider.tsx`)
- **Icons:** Lucide React (consistent line-art style)
- **Animations:** Framer Motion — celebration confetti (`canvas-confetti`), progress rings, streak counters

### Power Down Dark Override

The Power Down page forces dark theme regardless of user's app-wide theme setting, signaling the transition from "work mode" to "rest mode."

---

## Cron Jobs & Background Processing

Four GitHub Actions workflows in `.github/workflows/` call the cron endpoints on a schedule (cron does NOT run on Vercel). Each workflow is serialized with a `concurrency` group so a manual dispatch can't overlap a scheduled run:

| Workflow | Schedule | Endpoint | Purpose |
|----------|----------|----------|---------|
| `derailing.yml` | Hourly 18:00–23:00 UTC | `POST /api/cron/derailing` | Flag at-risk/derailing tasks and streaks, notify (deduped per local day via `Task.lastDerailNotifiedAt`) |
| `meeting-reminders.yml` | Every 5 min | `POST /api/cron/meeting-reminders` | Push reminders shortly before meetings |
| `review-nag.yml` | Daily 13:00 UTC | `POST /api/cron/review-nag` | Remind about overdue reviews (deduped via `Review.lastNaggedAt`) |
| `google-sync.yml` | Every 15 min | `POST /api/cron/google-sync` | Background 2-way Google Calendar sync |

A `POST /api/cron/streaks-recompute` handler also exists for manual/maintenance use; it has no scheduled workflow.

**Authentication:** All cron endpoints verify `CRON_SECRET` via timing-safe HMAC comparison in `requireCronSecret()`. The workflows send the secret as `Authorization: Bearer <secret>` using the `CRON_SECRET` and `PRODUCTION_URL` GitHub Actions secrets.

**How it works:** Cron endpoints are standard API routes that perform DB operations and send notifications. They are excluded from the auth middleware matcher.

---

## Security

| Concern | Implementation |
|---------|---------------|
| Authentication | NextAuth JWT + Google OAuth + password + 2FA (TOTP) |
| Authorization | Role-based (`isAdmin`) + ownership checks per resource |
| Token encryption | AES-256-GCM for Google refresh tokens at rest |
| Cron auth | Timing-safe HMAC comparison (`createHmac` + `timingSafeEqual`) |
| Account lockout | `isLockedOut` flag checked in JWT refresh callback |
| CSRF | `SameSite=Lax` session cookies + same-origin check on unsafe `/api` methods (`verifyRequestOrigin` in edge middleware; inline in `POST /api/invitations`) |
| Password hashing | bcryptjs |
| Headers | HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Permissions-Policy |
| Input validation | Server-side validation in every API route handler |
| Session expiry | 30-day max age on JWT tokens |

---

## Key Architectural Decisions

For detailed rationale on each decision, see [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md).

| Decision | Why |
|----------|-----|
| JWT over DB sessions | Avoid per-request DB calls in serverless |
| SWR over React Query | Simpler API, sufficient for the use case |
| Feature-organized components | Domain cohesion over type cohesion |
| `@prisma/adapter-pg` | Serverless connection pooling |
| Centralized color system | Prevent drift across 100+ components |
| Glass-morphism design | Distinctive identity, works with both themes |
| Multi-step wizards | Reduce cognitive overload for complex flows |
| `IMPROVE` = `GOAL_STACK` in DB | User-friendly naming with DB compatibility |
| Encrypted refresh tokens | Security at rest for OAuth tokens |
| Timing-safe cron auth | Prevent timing attacks on bearer tokens |
| Soft deletes for Goals only | High-value data recovery, simplicity elsewhere |
| Power Down dark override | Visual signal for evening wind-down |

---

## See Also

- [DATABASE.md](DATABASE.md) — Data model details
- [API-REFERENCE.md](API-REFERENCE.md) — All API endpoints
- [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) — Detailed ADRs
- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — How to work with this architecture
- [Prism_How_It_Works.md](Prism_How_It_Works.md) — Feature guide (user perspective)
