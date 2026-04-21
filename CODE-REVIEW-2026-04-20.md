# Prism — Consolidated Code Review

**Review Date:** 2026-04-20
**Base:** master @ `d9ea5f7` + 3 uncommitted files
**Prior audit:** [CODE-REVIEW.md](./CODE-REVIEW.md) (2026-03-29) — 216 commits since
**Method:** 6 parallel reviewer agents across partitions (Security, External, Tasks/Calendar/Powerdown, Goals/KPI/Processes, Reviews/Reports/Aims, Data/Config/Tests). Each delta-checked prior findings and surfaced new issues across correctness, security, performance, code quality.

---

## Headline

Real progress on schema, CI, Zod, and indexes — but **19 new critical issues** surfaced, and **2 prior fixes have regressed**. Four of the 7 prior Criticals are fully resolved; three are cosmetic-only or partially addressed.

---

## 🔴 Critical — must fix before production

### Authentication & session takeover

1. **Brute-force wide open** — `src/lib/auth.ts:67-150` never writes to `LoginAttempt` and never sets `isLockedOut`. The register rate-limit reads a table nothing populates. Prior Critical #1 is cosmetic.
   *Fix:* write attempts on every `authorize()` call; `lockoutUntil: DateTime` after N failures.

2. **Unauthenticated admin creation** — `src/lib/auth.ts:82-100`. On a fresh DB, any credential POST auto-creates an admin. Combined with the still-unfixed first-user race (H#8), two concurrent POSTs both become admin.
   *Fix:* require explicit bootstrap via env var or CLI seed; remove credential-path auto-creation.

3. **OAuth cross-user account takeover** — `src/lib/auth.ts:162` sets `allowDangerousEmailAccountLinking: true`. The post-hoc `events.signIn` remediation runs after the JWT is minted. Attacker signs in with Google as victim's email and gets a valid session.
   *Fix:* `false`, route linking through an authenticated flow.

### Cross-user authorization leaks (horizontal privilege escalation)

4. **`POST/PATCH/DELETE /api/tasks/[id]/clear-goals` — no ownership check** — `src/app/api/tasks/[id]/clear-goals/route.ts`. Only `requireAuth()`. Any logged-in user can mutate any task's clear-goals by ID enumeration.

5. **Review list shows ALL team reviews to every authed user** — `src/app/api/reviews/route.ts:22-35`. No TeamMember join. Free-text "successes / difficulties" of every employee leak across accounts.

6. **Company KPI owner + email leak** — `src/app/api/goals/[id]/kpis/route.ts:23` and `src/app/api/goals/[id]/assignees/route.ts:13`. `checkStackAccess` passes any authed user on a company stack. `CompanyGoalAssignment` is never consulted for scoping.

7. **`/api/calendar/events/[id]` PATCH/DELETE bypasses Prism ownership** — `src/app/api/calendar/events/[id]/route.ts:10-54`. Auth is checked; ownership is not. Any calendar the user has Google-side write access to becomes mutable with no audit.

### XSS / RCE / injection surfaces

8. **YAML parser uses default (unsafe) schema** — `src/lib/yaml-handler.ts:453`. `yaml.load` without `{ schema: FAILSAFE_SCHEMA }` on user-supplied imports up to 256 KB.

9. **CSP allows `'unsafe-inline'` AND `'unsafe-eval'`** — `next.config.mjs:24`. XSS mitigation effectively off. Switch to nonces + `'strict-dynamic'`; drop `'unsafe-eval'` in production.

10. **Prompt injection in AI prompts** — `src/lib/ai-prompts.ts` interpolates raw user strings into system/user messages; `src/lib/openrouter.ts:96-102` returns parsed JSON untyped. Model output drives UI actions (suggested tasks, decomposed goals). Wrap user content in delimiters; validate output with Zod.

11. **CSV formula injection in review export** — `src/app/api/reviews/export/route.ts:79-84`. `escapeCSV` handles quotes/commas/newlines but not leading `=`, `+`, `-`, `@`, `\t`, `\r`. Fields `notes`, `user.name`, `user.email`, `checklistState` are user-controlled. Also missing UTF-8 BOM and CRLF.

12. **SSRF bypass via encoded IPs** — `src/lib/url-validation.ts:45-51`. Blocks `127.0.0.1` literally but not `127.1`, `2130706433`, `0x7f.0.0.1`, `::ffff:127.0.0.1`, or DNS rebinding. Currently low-impact (fetched only client-side) — becomes critical the moment a thumbnailer/previewer lands.

### Data integrity / concurrency

13. **Process task-generator race** — `src/lib/process-task-generator.ts:130-217`. `count`-then-`create` guard is not transactional and there's no unique constraint on `(processId, periodStart)`. Two concurrent invocations duplicate tasks. Prior H#9 was partially addressed in logic but not atomically.

14. **Review double-complete race** — `src/app/api/reviews/[id]/route.ts:54-84`. Read-then-update with no guard. Both concurrent PATCHes increment the streak and fire Google-calendar deletes.
    *Fix:* `updateMany({ where: { id, completedAt: null }, ... })` and branch on count.

15. **Review answers race creating duplicate rows** — `src/app/api/reviews/[id]/answers/route.ts:49-64`. `findFirst` then branch create/update. No `@@unique([reviewId, stepKey])`. Wizard's `persistCurrentStep` is fire-and-forget so interleaved saves dupe.
    *Fix:* add unique constraint + `upsert`.

16. **Goal reparent accepts cycles** — `src/app/api/goals/[id]/reorder/route.ts:41-65`. `flattenTree` has no visited-set and `cascadeProgressUp`'s depth cap of 20 only masks the integrity bug. Walk the ancestor chain and reject.

### Availability / cost

17. **Leaderboard unbounded global fetch** — `src/app/api/leaderboard/route.ts:49-78`. Every `AimInstance`, `ProcessExecution`, `PowerdownSession`, `Task`, `Review` with `completedAt != null` across all users. OOM risk at scale, cached only 30s.

18. **`admin/tasks/bulk` and `admin user delete` have no audit trail** — `src/app/api/tasks/bulk/route.ts:33-35`, `src/app/api/admin/route.ts:47-61`. High-blast-radius endpoints with zero logging.

### Schema drift → 500s

19. **`updateIdeaSchema.status: z.string()`** — `src/lib/schemas.ts:494`. Prisma field is the `IdeaStatus` enum; any non-enum string 500s at runtime.

---

## 🟡 Prior-audit delta (7 Critical / 28 High / 30 Medium)

| Prior | Status | Note |
|---|---|---|
| C#1 rate limit/lockout | 🟠 Cosmetic only | `LoginAttempt` never written (see new Critical #1). |
| C#2 `TOKEN_ENCRYPTION_KEY` | 🟠 Partial | Required in prod; plaintext fallback still active in non-prod. |
| C#3 attachment SSRF | 🟢 Fixed | Validator present; hardening needed (new #12). |
| C#4 no CI/CD | 🟢 Fixed | `.github/workflows/ci.yml` runs lint/tsc/test/build. Gaps: no Postgres service, no coverage threshold. |
| C#5 no integration tests | 🟠 Partial | 50 test files (was 14); ~9% of 114 API routes covered. Still no E2E. |
| C#6 invite email ownership | 🟠 Partial | Timing-safe token; still no mailbox-control proof. |
| C#7 password complexity | 🟢 Fixed | 12-char + mixed + digit + special. |
| H#8 first-user admin race | 🔴 Still present | No advisory lock / `FOR UPDATE`. |
| H#9 cron idempotency | 🟠 Partial | Logic guard exists; not atomic (new #13). |
| H#10 recurrence DoS | 🔴 Still present | `parseRRule` no bounds. |
| H#11 MIME whitelist | 🟢 Fixed | |
| H#12 timezone validation | 🟢 Fixed | |
| H#13 leaderboard opt-in | 🔴 REGRESSED | Migration `20260402200000` set default `true` and backfilled everyone. Opt-out, not opt-in. |
| H#14 N+1 reviews list | 🔴 Still present | |
| H#15 safe body parser | 🟢 Fixed | `parseBody` used in 177 call-sites. |
| H#16 Zod adoption | 🟢 Fixed | 85+ schemas. |
| H#17 `any` baseline | 🟠 Partial | 635 → 238 (62% reduction). Hotspots: PowerDownRitual, WeeklyReviewWizard, YamlImportExport. |
| H#18 silent fetch in TaskEditor | 🟢 Fixed | |
| H#19 drag/drop race | 🟠 Partial | Single-op correct; concurrent drags still interleave. |
| H#20 modal a11y | 🟢 Mostly fixed | Focus trap still missing. |
| H#21 dynamic-import error boundary | 🟢 Fixed | |
| H#22 TaskEditor waterfall | 🔴 Still present | |
| H#23 SWR timeout | 🔴 Still present | |
| H#24 `migrate deploy` | 🟢 Fixed | |
| H#25 5-min JWT TTL | 🔴 Still present | Demoted admin / revoked user has up to 5 min of access. |
| H#26 structured logging | 🔴 Still present | 26 console.* in External partition alone. |
| H#27 composite indexes | 🟢 Fixed (strong) | Task has 11 indexes. |
| H#28 env validation at startup | 🟠 Partial | Prod-only; no format validation. |
| M#29 error response format | 🟢 Fixed | |
| M#32 timing-safe email compare | 🔴 Still present | |
| M#33 CSRF beyond NextAuth | 🔴 Still present | |
| M#34 body size limits | 🔴 Still present | |
| M#35 calendar sync pagination | 🟠 Partial | Server paginates Google; response to client is single array. |
| M#36 prop drilling | 🟠 Partial | `GoalStackTree` improved; `WeeklyReviewWizard` worse (958 lines). |
| M#42 DashboardTimeline leak | 🟢 Fixed | |

---

## 🟣 Important (must-fix-soon)

### Partition A — Security
- Invitation accept doesn't prove mailbox control — only session-email match.
- Invitation revoke doesn't expire victim JWT (5-min TTL window).
- Admin user delete has no confirmation / audit / soft delete.
- GET `/api/invitations/[id]` is unauthenticated and returns invitee email.
- 2FA secret stored unencrypted (`User.totpSecret`).
- `NEXT_PUBLIC_DEV_LOGIN` env is client-bundled — staging with `NODE_ENV=development` = open login.
- Invite URL built from unvalidated `x-forwarded-host` / `origin` headers.
- Cron HMAC uses hardcoded constant as key (use `NEXTAUTH_SECRET`).
- Completion tokens have no expiry/nonce.

### Partition B — External integrations
- Token refresh failure doesn't clear stored tokens — users never prompted to reconnect.
- No Google 429 backoff / no idempotency keys — Vercel retries can double-create events.
- `syncTaskCalendarEvent` swallows create failures and persists empty state, causing duplicates on next sync.
- `sendUpdates: 'all'` on calendar writes — surprise emails to attendees on every server-side sync.
- Beeminder daystamp uses server TZ, not user TZ.
- Beeminder API token stored plaintext in DB.
- `/api/calendar/sync` lacks concurrency lock — parallel calls duplicate events.
- `sendEmailMessage` doesn't validate `to`; no length cap on `inviterName`.
- Push-subscription `endpoint` not scheme/host validated.
- `chatJSON` parser returns untyped `T` — no Zod validation on AI output.

### Partition C — Tasks/Calendar/PowerDown
- `isWinTheDay` unflag race (outside transaction).
- Fire-and-forget `postUpdate` on serverless — recurrences can be frozen mid-work.
- Work-block conflict handling absent (last-writer-wins on two-device drag).
- FullCalendar draggable IDs not stable (triple-prefix fallback hints drift).
- PowerDown ritual not idempotent — double-mount (strict mode / back-nav) creates two sessions.
- No `AbortSignal` on any `fetch` in `PowerDownRitual.tsx`.
- `TaskEditor.task?: any` + heavy `(u: any)` casts.
- DST date-parsing issues (`new Date(date + 'T00:00:00')`) still present.

### Partition D — Goals/KPI/Processes
- `GoalLink.weight` not validated (negative/huge allowed → `computeLinkedProgress` invert).
- KPI aggregation ignores user timezone AND `GoalStack.weekStartDay`.
- Process ADVANCED mode ignores user TZ.
- Non-admin lists company-stack assignees freely.
- KPI link cycle not prevented (currently 1-hop; guard now).
- N+1 on GoalStackTree server render (large HHG stacks inflate heavily).
- Stack GET recursion depth hard-coded at 5 — brittle.

### Partition E — Reviews/Reports/Aims/Streaks
- Streak grace-day savable via backdating `completedAt`.
- Aim-phase graduation not idempotent on double-submit.
- `derailing.ts` vs `derailing-buffer.ts` disagree on union type + logic.
- `review-dates.ts` last-sat-dec uses local TZ → wrong day for users west of UTC.
- Review week boundaries ignore user TZ (`WeeklyReviewWizard.tsx:197-220` + `review-dates.ts:11-13`).
- `publicWin.findMany` has no opt-out filter.
- `/api/streaks/reset` has no re-auth, no audit trail, no CSRF.
- `companyReport` lacks `requireAdmin` — any authed user pulls per-person stats.

### Partition F — Data/Config/Tests
- `IdeaAttachment` model exists but has no API route or SSRF validation.
- CI never exercises `prisma migrate deploy` (no Postgres service).
- Tests excluded from typecheck (`tsconfig.json:25`).
- Cron workflow URLs silent-fail on misconfig.
- `session.user as any` leak in multiple pages — augment `next-auth` types.
- `User` model has 50+ columns — decomposition candidate.
- 31 relations without explicit `onDelete` policies.
- Vitest has no coverage threshold.

---

## 🧭 Cross-cutting themes

- **Horizontal authZ is the dominant defect class.** 5 critical leaks (reviews list, clear-goals, company KPIs/assignees, calendar events, push endpoints). `requireAuth()` is called everywhere but `requireTaskAccess` / `CompanyGoalAssignment` membership checks are missed consistently. Adopt a typed `withResourceAuth(resourceId)` wrapper; enforce via lint rule.
- **Data-integrity races.** 5 new race conditions (process generator, isWinTheDay unflag, review complete, review answers, aim-phase graduation, goal reparent cycles). None guarded by `$transaction` + row lock or conditional `updateMany`. Standardize with a `withOptimisticLock(entity, version)` helper.
- **Timezone correctness.** KPI aggregation, process ADVANCED mode, review week boundaries, CSV date cells, Beeminder daystamp all operate in server-local/UTC rather than user TZ. `User.timezone` exists but is rarely threaded. Fix as a single initiative.
- **Trust-boundary sanitization.** CSV formula injection, YAML unsafe schema, AI output not Zod-validated. All user-boundary concerns.
- **`any` type hotspots** = the components with the most complex state (PowerDownRitual, WeeklyReviewWizard, YamlImportExport). These are exactly where typing has the highest bug-catching ROI.
- **God components still growing.** `page.tsx` 632 → ~750 lines; `CalendarView` >1200; `WeeklyReviewWizard` 958.

---

## 🟢 Strengths worth preserving

- AES-256-GCM token encryption implementation is textbook (`src/lib/crypto.ts`).
- `requireAuth/requireAdmin` is called on every route.
- Invitation token is `crypto.randomBytes(32)` — well above minimum entropy.
- Composite indexes coverage is comprehensive (Task has 11).
- Zod + `parseBody` is now the standard pattern.
- Migration sequence is safe and non-destructive (52 migrations; one deliberate DELETE properly staged).
- `ErrorBoundary` at root layout; CalendarView now wrapped.
- `cascadeProgressUp` is iterative with depth cap.
- CI now runs lint + tsc + vitest + build.
- `maybePostBeeminder` uses Beeminder `requestid` for idempotency.
- `upsertRecurringSeries` preserves existing `eventId` on transient errors.
- `authorizeProcessAccess` helper consolidates per-process ownership/delegate/admin checks.

---

## 🧪 Test coverage

- Total: **50 test files** (up from 14 in March).
- API route coverage: **~9%** (10 of 114 route files have tests).
- No E2E / Playwright.
- No coverage threshold in `vitest.config.ts`.
- Biggest untested surface: `src/lib/auth.ts` (the single most security-critical file), all cron routes, `kpi-aggregation`, `kpi-progress`, `process-task-generator`, `cascadeProgressUp`, review answers + completion, CSV export, `url-validation`, calendar sync, OpenRouter retry.
- Tests excluded from TypeScript check via `tsconfig.json:25` — test type errors are invisible in CI.

---

## 📋 Recommended fix order

### This sprint (1-2 weeks)
1. Horizontal authZ leaks (#4–#7) — 1-day fix per route; biggest confidentiality risk.
2. Lockout wiring (#1) + disable OAuth auto-linking (#3).
3. YAML safe schema (#8) + CSV formula injection (#11).
4. Leaderboard privacy re-flip (opt-in) + unbounded-fetch fix (#17, H#13).
5. Review double-complete + answers race (#14, #15) — add `@@unique([reviewId, stepKey])`.

### Next sprint (2-4 weeks)
6. Process-generator atomicity (#13), goal-reparent cycle guard (#16).
7. CSP hardening (#9), prompt injection (#10).
8. Recurrence DoS (H#10), JWT TTL (H#25).
9. Admin action audit log (M#31 + new).
10. Timezone correctness initiative (KPI aggregation, review boundaries, CSV dates).

### Ongoing
- SSRF validator hardening (#12) — before any server-side preview/thumbnail feature lands.
- `any` reduction in the three hotspot components.
- Decompose `WeeklyReviewWizard`, `CalendarView`, app `page.tsx`.
- Coverage threshold in vitest; run `prisma migrate deploy` in CI against a real Postgres service.
- Structured logging (H#26) + JSON logs for cron workflows.

---

## 📝 Uncommitted working-tree changes

The 3 uncommitted files (`src/app/api/tasks/[id]/route.ts`, `src/app/api/tasks/route.ts`, `src/components/tasks/TaskEditor.tsx`) are a clean assignee-display feature: safe to commit. Two minor notes:
- `src/components/tasks/AgendaView.tsx:219` switched avatar source to `task.assignee.image` — unassigned tasks now render no avatar (confirm intent).
- PATCH response omits `goal`/`workBlocks`/`clearGoals` from prior shape — fine for current callers (SWR optimistic paths don't overwrite with response), but note for future refactors.
