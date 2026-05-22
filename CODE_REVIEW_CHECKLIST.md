# Prism Code Review & Simplification Checklist

> **Purpose:** Systematic review of every component, API route, utility, and script in the Prism app for security, safety, performance, code quality, and simplification opportunities.
>
> **How to use:** Work through each phase in order. Check off items as you complete them. Each item includes the file path, what to check, and why it matters.
>
> **Priority legend:** `[CRITICAL]` fix immediately | `[HIGH]` fix this sprint | `[MEDIUM]` plan for next sprint | `[LOW]` nice to have

---

## Phase 1: Security

### 1.1 Authentication & Session Management

**Files:** `src/lib/auth.ts`, `src/lib/auth-guard.ts`, `src/middleware.ts`

- [ ] `[CRITICAL]` `auth.ts` — Remove `debug: true` (hardcoded). Change to `process.env.NODE_ENV === 'development'`. Debug mode leaks internal auth flow details in production logs.
- [ ] `[CRITICAL]` `auth.ts` — Remove or gate 28+ `console.log` calls behind `NODE_ENV === 'development'`. These expose user emails, password presence, admin counts, and auth flow status in server logs.
- [ ] `[HIGH]` `auth.ts` — Verify the outer catch block (around `authorize()`) does not swallow 2FA-required errors. The catch returns `null` which triggers a generic "CredentialsSignin" error instead of prompting 2FA.
- [ ] `[HIGH]` `auth.ts` — Verify `NEXT_PUBLIC_DEV_LOGIN` is never set in production deployment configs (Vercel env vars). Dev login provider bypasses password+2FA entirely.
- [ ] `[HIGH]` `auth.ts` — Review `allowDangerousEmailAccountLinking: true` on Google provider. Verify the `events.signIn` cross-user remediation logic covers all edge cases (e.g., user A's Google email matches user B's credential email).
- [ ] `[MEDIUM]` `auth.ts` — Session maxAge is 30 days. Evaluate if this is appropriate for the security model, especially for admin users. Consider shorter sessions for admins.
- [ ] `[MEDIUM]` `auth-guard.ts` — `requireAuthFromRequest()` reconstructs a synthetic session from JWT without DB validation. Verify that the `isLockedOut` flag in the token is reliably updated when a user is locked out.
- [ ] `[MEDIUM]` `middleware.ts` — `/api/invitations` and `/api/health` are excluded from auth. Verify these endpoints don't leak sensitive data when called unauthenticated.

**Files:** `src/app/api/auth/register/route.ts`, `src/app/api/auth/setup-2fa/route.ts`

- [ ] `[HIGH]` Registration route — Check for rate limiting to prevent brute-force registration.
- [ ] `[HIGH]` Registration route — Check for email enumeration prevention (same response time/message for existing vs. new emails).
- [ ] `[MEDIUM]` 2FA setup route — Verify TOTP secret is encrypted at rest. Currently stored as plaintext `totpSecret` in the User model.
- [ ] `[MEDIUM]` 2FA verify route — Check for rate limiting on TOTP code attempts to prevent brute-force.

---

### 1.2 Completion Tokens (Unauthenticated Endpoints)

**Files:** `src/lib/completion-token.ts`, `src/app/api/tasks/[id]/complete-external/route.ts`, `src/app/api/aims/instances/[id]/complete-external/route.ts`

- [ ] `[CRITICAL]` `completion-token.ts` — Remove the fallback to `'prism-default-secret'`. If both `TOKEN_ENCRYPTION_KEY` and `NEXTAUTH_SECRET` are missing, the function must throw, not use a known hardcoded secret.
- [ ] `[HIGH]` `completion-token.ts` — HMAC is truncated to 16 hex chars (64 bits). Increase to at least 32 hex chars (128 bits) to resist brute-force.
- [ ] `[HIGH]` Both `complete-external` routes — No rate limiting on these unauthenticated endpoints. A 64-bit token is brute-forceable without rate limits.
- [ ] `[MEDIUM]` Both `complete-external` routes — Completion tokens have no expiry. Add a timestamp to the token payload and reject tokens older than a reasonable window (e.g., 7 days).

---

### 1.3 Input Validation (Critical Gap)

**Overview:** Only ~7 of 93 API routes use `parseBody()` with Zod schema validation. The remaining ~60+ mutation routes use `safeParseJson()` which only wraps `request.json()` in try/catch — zero field validation.

**Priority routes to add Zod schemas (handle sensitive data or complex mutations):**

- [ ] `[CRITICAL]` `src/app/api/admin/route.ts` — PATCH/DELETE accept `userId` and `isAdmin` with no Zod validation. Admin privilege escalation risk.
- [ ] `[CRITICAL]` `src/app/api/goals/import/route.ts` — Imports goal stacks from YAML. Must validate structure before creating DB records.
- [ ] `[CRITICAL]` `src/app/api/processes/import/route.ts` — Imports process definitions. Must validate structure.
- [ ] `[HIGH]` `src/app/api/settings/auth/route.ts` — Auth settings mutations need validation.
- [ ] `[HIGH]` `src/app/api/settings/feedback/route.ts` — Verify input validation.
- [ ] `[HIGH]` `src/app/api/training/quiz/generate/route.ts` — User input passed to AI. Validate and sanitize.
- [ ] `[HIGH]` `src/app/api/training/quiz/check/route.ts` — User input passed to AI. Validate and sanitize.
- [ ] `[HIGH]` `src/app/api/tasks/ai-suggest/route.ts` — User input passed to OpenRouter AI. Validate and sanitize.
- [ ] `[HIGH]` `src/app/api/calendar/sync/route.ts` — 1,072-line file. Audit all inputs for validation.

**Remaining API routes — add Zod schemas to all mutation endpoints:**

- [ ] `[HIGH]` `src/app/api/tasks/route.ts` — POST (create task)
- [ ] `[HIGH]` `src/app/api/tasks/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/tasks/[id]/comments/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/tasks/[id]/status/route.ts` — PATCH
- [ ] `[HIGH]` `src/app/api/tasks/[id]/clear-goals/route.ts` — POST/PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/tasks/[id]/subtasks/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/goals/route.ts` — POST (create goal)
- [ ] `[HIGH]` `src/app/api/goals/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/goals/[id]/kpis/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/goals/reorder/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/aims/route.ts` — POST (create aim)
- [ ] `[HIGH]` `src/app/api/aims/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/aims/instances/[id]/route.ts` — PATCH
- [ ] `[HIGH]` `src/app/api/aims/scheduling/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/processes/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/processes/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/processes/[id]/steps/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/processes/[id]/kpis/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/processes/[id]/schedule/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/reviews/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/reviews/[id]/route.ts` — PATCH
- [ ] `[HIGH]` `src/app/api/reviews/[id]/answers/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/meetings/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/meetings/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/ideas/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/ideas/[id]/route.ts` — PATCH/DELETE
- [ ] `[HIGH]` `src/app/api/kpis/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/notifications/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/reactive-tasks/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/reactive-tasks/[id]/route.ts` — PATCH
- [ ] `[HIGH]` `src/app/api/stacks/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/invitations/route.ts` — POST
- [ ] `[HIGH]` `src/app/api/invitations/[id]/route.ts` — PATCH
- [ ] `[HIGH]` `src/app/api/powerdown/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/streaks/route.ts` — POST/PATCH
- [ ] `[HIGH]` `src/app/api/settings/route.ts` — Verify existing validation is complete
- [ ] `[HIGH]` `src/app/api/distractions/route.ts` — POST

---

### 1.4 Injection Prevention

**Files:** `src/lib/openrouter.ts`, `src/lib/ai-prompts.ts`, `src/lib/yaml-handler.ts`, `src/lib/mention-parser.ts`

- [ ] `[HIGH]` All API routes — Audit for any use of `prisma.$queryRaw` or `prisma.$executeRaw` (SQL injection risk). Prisma's query builder is safe, but raw queries are not.
- [ ] `[HIGH]` `yaml-handler.ts` — Verify `js-yaml` uses `yaml.load()` with `JSON_SCHEMA` or `FAILSAFE_SCHEMA` (safe), NOT `yaml.load()` with default schema (allows code execution).
- [ ] `[HIGH]` `ai-prompts.ts` — Check all prompt templates for user-controlled strings interpolated into system prompts. Sanitize or use clear user/system message separation to prevent prompt injection.
- [ ] `[MEDIUM]` `mention-parser.ts` — Verify parsing output is escaped before rendering in task comments. Stored XSS via crafted @mentions.
- [ ] `[MEDIUM]` `openrouter.ts` — Verify API key is only used server-side and never exposed to the client (no `NEXT_PUBLIC_` prefix).

---

### 1.5 Cryptographic Security

**Files:** `src/lib/crypto.ts`, `src/lib/completion-token.ts`, `src/lib/env-check.ts`

- [ ] `[MEDIUM]` `crypto.ts` — Verify AES-256-GCM implementation: random IV per encryption, auth tag stored alongside ciphertext, no IV reuse.
- [ ] `[MEDIUM]` `env-check.ts` — Verify `TOKEN_ENCRYPTION_KEY` is enforced as required in production (not just warned).
- [ ] `[LOW]` Verify all Google refresh tokens in the DB are encrypted (no legacy plaintext values from before encryption was added).

---

### 1.6 Authorization & Access Control

**Check every `[id]` route for ownership verification:**

- [ ] `[HIGH]` `src/app/api/tasks/[id]/route.ts` — Verify `requireTaskAccess()` is called before mutation.
- [ ] `[HIGH]` `src/app/api/goals/[id]/route.ts` — Verify ownership check before PATCH/DELETE.
- [ ] `[HIGH]` `src/app/api/processes/[id]/route.ts` — Verify `authorizeProcessAccess()` is called.
- [ ] `[HIGH]` `src/app/api/reviews/[id]/route.ts` — Verify ownership check.
- [ ] `[HIGH]` `src/app/api/meetings/[id]/route.ts` — Verify ownership check.
- [ ] `[HIGH]` `src/app/api/ideas/[id]/route.ts` — Verify ownership check.
- [ ] `[HIGH]` `src/app/api/aims/[id]/route.ts` — Verify ownership check.
- [ ] `[HIGH]` `src/app/api/reactive-tasks/[id]/route.ts` — Verify ownership check.
- [ ] `[HIGH]` `src/app/api/kpis/[id]/route.ts` — Verify ownership check (if exists).
- [ ] `[MEDIUM]` `src/app/api/admin/route.ts` — Verify only admins can toggle admin status on other users.
- [ ] `[MEDIUM]` Task GET with `scope=company` — Verify it doesn't leak tasks across unrelated users.
- [ ] `[MEDIUM]` `checkStackAccess()` in `auth-guard.ts` — Company stacks readable by all users but writable only by admins. Verify this is intentional.

---

## Phase 2: Safety (Error Handling & Data Integrity)

### 2.1 Error Handling Consistency

**Overview:** Only ~20 of 92 API routes have try/catch blocks. The remaining ~72 routes return raw 500 errors on any exception.

- [ ] `[HIGH]` Determine pattern: either add try/catch to all API routes OR create a global API route wrapper function (e.g., `withErrorHandler(handler)`) that catches, logs, and returns a clean `{ error: 'Internal server error' }` response.
- [ ] `[HIGH]` `auth.ts` — Fix the outer catch block that returns `null` for ALL errors including 2FA signals. The 2FA error types should propagate to the client.
- [ ] `[MEDIUM]` Verify all Prisma `update()` / `delete()` calls handle `RecordNotFound` errors gracefully (return 404, not 500).
- [ ] `[MEDIUM]` Verify all Prisma `create()` calls handle unique constraint violations (return 409 Conflict, not 500).

**Check each API route directory for error handling:**

- [ ] `[MEDIUM]` `src/app/api/tasks/` — All route files
- [ ] `[MEDIUM]` `src/app/api/goals/` — All route files
- [ ] `[MEDIUM]` `src/app/api/aims/` — All route files
- [ ] `[MEDIUM]` `src/app/api/processes/` — All route files
- [ ] `[MEDIUM]` `src/app/api/reviews/` — All route files
- [ ] `[MEDIUM]` `src/app/api/calendar/` — All route files
- [ ] `[MEDIUM]` `src/app/api/meetings/` — All route files
- [ ] `[MEDIUM]` `src/app/api/notifications/` — All route files
- [ ] `[MEDIUM]` `src/app/api/kpis/` — All route files
- [ ] `[MEDIUM]` `src/app/api/leaderboard/` — All route files
- [ ] `[MEDIUM]` `src/app/api/powerdown/` — All route files
- [ ] `[MEDIUM]` `src/app/api/ideas/` — All route files
- [ ] `[MEDIUM]` `src/app/api/reactive-tasks/` — All route files
- [ ] `[MEDIUM]` `src/app/api/stacks/` — All route files
- [ ] `[MEDIUM]` `src/app/api/streaks/` — All route files
- [ ] `[MEDIUM]` `src/app/api/settings/` — All route files
- [ ] `[MEDIUM]` `src/app/api/reports/` — All route files
- [ ] `[MEDIUM]` `src/app/api/admin/` — All route files
- [ ] `[MEDIUM]` `src/app/api/invitations/` — All route files
- [ ] `[MEDIUM]` `src/app/api/training/` — All route files
- [ ] `[MEDIUM]` `src/app/api/distractions/` — All route files
- [ ] `[MEDIUM]` `src/app/api/cron/` — All route files
- [ ] `[MEDIUM]` `src/app/api/webhooks/` — All route files (if exists)

---

### 2.2 Data Integrity

- [ ] `[HIGH]` `src/app/api/admin/route.ts` DELETE — Hard-deletes users with `prisma.user.delete()`. Cascading deletes may remove tasks, goals, reviews, etc. Verify cascade behavior is intentional. Consider soft delete (`deletedAt`) for consistency with goals.
- [ ] `[HIGH]` `src/app/api/calendar/sync/route.ts` — 1,072 lines. Verify Google API failures don't leave the DB in an inconsistent state. All multi-step operations should use Prisma transactions.
- [ ] `[MEDIUM]` `src/app/api/goals/route.ts` POST with `autoGenerate` — Creates many goals in a transaction. Verify rollback on partial failure.
- [ ] `[MEDIUM]` Verify all date handling uses timezone-aware functions from `date-utils.ts` consistently. Check for bare `new Date()` calls that ignore user timezone.
- [ ] `[LOW]` Goal deletion uses `deletedAt` soft delete but user deletion is hard delete — document or unify this pattern.

---

### 2.3 Concurrent Access

- [ ] `[MEDIUM]` `src/lib/task-helpers.ts` — `unflagOtherWinTheDay()`: Race condition if two requests set WTD simultaneously. Wrap in a Prisma transaction with `SELECT ... FOR UPDATE` or use a unique constraint.
- [ ] `[MEDIUM]` `src/lib/progress.ts` — `cascadeProgressUp()`: Could produce incorrect results under concurrent goal updates. Consider optimistic locking or transaction isolation.
- [ ] `[LOW]` `src/lib/derailing-checker.ts` — Module-level `lastCheckTime` variable resets on cold starts in serverless. The 30-minute guard is unreliable. Use DB-based timestamp instead.

---

## Phase 3: Performance

### 3.1 Database Query Efficiency

- [ ] `[HIGH]` `src/app/api/tasks/route.ts` GET — Calls `checkAndCreateDueProcessTasks()` and `checkDerailingTasks()` on EVERY task list fetch. Move these to cron-only execution. They add latency to every page load.
- [ ] `[HIGH]` `src/app/api/goals/route.ts` GET — Includes `children`, `tasks`, `kpis`, `companyGoalLinks` with nested includes. Check for N+1 query patterns. Consider `select` instead of `include` to fetch only needed fields.
- [ ] `[MEDIUM]` `src/app/api/calendar/sync/route.ts` — Likely performs many sequential DB operations. Check for batch optimization (use `createMany`, `updateMany`, `deleteMany` where possible).
- [ ] `[MEDIUM]` `src/app/api/reports/route.ts` — Aggregates across many tables. Check for query efficiency. Consider pre-computed materialized views or cached aggregations.
- [ ] `[MEDIUM]` `src/lib/process-task-checker.ts` and `src/lib/process-task-generator.ts` — Understand query patterns. Check for N+1 issues when generating tasks for multiple processes.
- [ ] `[LOW]` Prisma schema — 56 `@@index` annotations. Verify all are used by actual queries and none are missing for common query patterns (check slow query logs if available).

---

### 3.2 Bundle Size

- [ ] `[HIGH]` Verify `googleapis` (very large package) is only imported in server-side files (API routes, `src/lib/`). If imported in any component, it will bloat the client bundle.
- [ ] `[HIGH]` `canvas-confetti` — Should be dynamically imported (`next/dynamic`) since celebration animations are not critical path.
- [ ] `[HIGH]` `driver.js` (onboarding) — Should be dynamically imported since onboarding is a one-time flow.
- [ ] `[MEDIUM]` `framer-motion` v12 — Verify only needed features are imported (e.g., `import { motion } from 'framer-motion'` not the entire library).
- [ ] `[MEDIUM]` `@fullcalendar/*` (6 packages) — Verify calendar page uses `next/dynamic` to lazy-load FullCalendar.
- [ ] `[MEDIUM]` `recharts` — Verify chart components use dynamic imports on pages that aren't the primary view.
- [ ] `[LOW]` Run `ANALYZE=true next build` with `@next/bundle-analyzer` (already in devDeps) to identify the largest chunks and optimize.

---

### 3.3 Rendering Performance

**Large components to check for unnecessary re-renders:**

- [ ] `[MEDIUM]` `src/components/calendar/CalendarView.tsx` (1,395 lines) — Check for `useMemo`/`useCallback` on event handlers and computed data. FullCalendar re-renders are expensive.
- [ ] `[MEDIUM]` `src/components/calendar/CalendarSplitView.tsx` (1,349 lines) — Same checks as CalendarView.
- [ ] `[MEDIUM]` `src/components/reviews/PeriodReviewWizard.tsx` (1,252 lines) — Check if step components are memoized. Only the active step should re-render on state change.
- [ ] `[MEDIUM]` `src/components/reviews/WeeklyReviewWizard.tsx` (816 lines) — Same as above.
- [ ] `[MEDIUM]` `src/components/reviews/YearlyReviewWizard.tsx` (704 lines) — Same as above.
- [ ] `[MEDIUM]` `src/app/(app)/page.tsx` (Dashboard) — Check how many SWR hooks fire simultaneously on initial load. Stagger or prioritize above-the-fold data.
- [ ] `[LOW]` Task lists, goal trees — Verify virtualization is used for long lists (consider `@tanstack/react-virtual` if lists exceed 50+ items).

---

### 3.4 Caching

- [ ] `[MEDIUM]` GET routes — Verify all use `cacheHeaders()` from `api-helpers.ts` consistently.
- [ ] `[MEDIUM]` Mutation routes (POST/PATCH/DELETE) — Verify all return `Cache-Control: no-store`.
- [ ] `[LOW]` SWR client — Check `refreshInterval` values across hooks. Ensure they match server cache TTLs and aren't polling too aggressively.

---

## Phase 4: Code Quality & Consistency

### 4.1 Type Safety

**Overview:** 131+ explicit `: any` usages. ESLint has `no-explicit-any: "warn"` — should be `"error"` after fixing.

**Highest-count files to fix first:**

- [ ] `[MEDIUM]` `src/components/calendar/CalendarView.tsx` — 15 `any` usages. Replace with FullCalendar event types.
- [ ] `[MEDIUM]` `src/components/calendar/CalendarSplitView.tsx` — 14 `any` usages. Same.
- [ ] `[MEDIUM]` `src/app/(app)/settings/page.tsx` — 7 `any` usages. Replace with settings types.
- [ ] `[MEDIUM]` `src/app/api/tasks/route.ts` — `const accessFilter: any = {}`. Type the Prisma where clause properly.
- [ ] `[MEDIUM]` `src/app/api/calendar/sync/route.ts` — Multiple `any` in Google Calendar API handling.
- [ ] `[MEDIUM]` All remaining API routes — Fix `any` types in Prisma query builders.
- [ ] `[MEDIUM]` All remaining components — Fix `any` types in props, state, event handlers.
- [ ] `[LOW]` `.eslintrc.json` — After fixing, change `@typescript-eslint/no-explicit-any` from `"warn"` to `"error"`.
- [ ] `[LOW]` `src/types/` — Only 4 type files. Create shared types for common API response shapes, component prop patterns.

---

### 4.2 Logging Hygiene

- [ ] `[HIGH]` `src/lib/auth.ts` — 28+ `console.log` calls. Remove all or gate behind `NODE_ENV === 'development'`. These expose PII (emails, admin status) in production.
- [ ] `[MEDIUM]` All `src/lib/*.ts` files — Audit `console.error` calls for sufficient context (include request IDs, user IDs where available).
- [ ] `[LOW]` Consider structured logging (e.g., `pino`) with log levels, request IDs, and user context for production observability.

---

### 4.3 API Response Patterns

- [ ] `[MEDIUM]` Standardize response format — Some routes use `Response.json(data)`, others `new Response(JSON.stringify(data))`. Pick one pattern (prefer `Response.json()`).
- [ ] `[MEDIUM]` Error responses — Verify all use `{ error: 'message' }` format consistently.
- [ ] `[LOW]` HTTP status codes — Verify: 201 for POST creates, 200 for GET/PATCH, 204 for DELETE, 400 for validation errors, 401 for auth, 403 for authorization, 404 for not found, 409 for conflicts.

---

### 4.4 Import & Module Patterns

- [ ] `[HIGH]` `src/lib/api-helpers.ts` — `safeParseJson()` and `src/lib/schemas.ts` `parseBody()` serve overlapping purposes. Deprecate `safeParseJson()` in favor of `parseBody()` with required Zod schemas (ties into Section 1.3).
- [ ] `[MEDIUM]` `src/lib/auth-guard.ts` — `authorizeProcessAccess()` uses dynamic `await import('./prisma')` while all other functions import at top level. Standardize.
- [ ] `[MEDIUM]` `src/lib/derailing-checker.ts` — Duplicates logic from `src/app/api/cron/derailing/route.ts`. Consolidate (see Section 5.2).

---

## Phase 5: Simplification

### 5.1 Component Consolidation

**Review Wizards (5 components, 3,272 lines total):**

- [ ] `[MEDIUM]` Analyze shared patterns across:
  - `src/components/reviews/ReviewWizard.tsx` (397 lines)
  - `src/components/reviews/WeeklyReviewWizard.tsx` (816 lines)
  - `src/components/reviews/MonthlyReviewWizard.tsx` (103 lines)
  - `src/components/reviews/YearlyReviewWizard.tsx` (704 lines)
  - `src/components/reviews/PeriodReviewWizard.tsx` (1,252 lines)
- [ ] `[MEDIUM]` Identify duplicate step logic: `shared/DifficultiesStep.tsx` vs `weekly-steps/StepDifficulties.tsx`, `shared/KpiProgressStep.tsx` vs `weekly-steps/StepKpiProgress.tsx`. Merge duplicates.
- [ ] `[MEDIUM]` Consider a single configurable wizard component that takes step definitions as config. Each review type provides its own step config.

**Calendar Components (2 components, 2,744 lines):**

- [ ] `[MEDIUM]` `src/components/calendar/CalendarView.tsx` (1,395 lines) and `CalendarSplitView.tsx` (1,349 lines) — Extract shared rendering/event logic into a shared hook or utility.

**Editor/Card Pairs:**

- [ ] `[LOW]` `src/components/goals/GoalEditor.tsx` vs `GoalCard.tsx` — Check for shared edit/display logic that can be extracted.
- [ ] `[LOW]` `src/components/tasks/TaskEditor.tsx` vs `TaskCard.tsx` — Same check.

---

### 5.2 Library Deduplication

**Derailing (3 files, overlapping concern):**

- [ ] `[MEDIUM]` Consolidate into a single module:
  - `src/lib/derailing.ts` (49 lines) — Task derail status
  - `src/lib/derail-detection.ts` (139 lines) — Aim derail analysis
  - `src/lib/derailing-checker.ts` (63 lines) — Notification dispatch (duplicates cron route)

**Task utilities (2 files, unclear separation):**

- [ ] `[LOW]` `src/lib/task-helpers.ts` (52 lines, server-only with Prisma) vs `src/lib/task-utils.ts` (9 lines, pure functions) — Merge or clarify separation with naming (e.g., `task-helpers.server.ts`).

**Process files (5 files, could be a directory):**

- [ ] `[LOW]` Consider moving to `src/lib/processes/`:
  - `src/lib/process-constants.ts`
  - `src/lib/process-animations.ts`
  - `src/lib/process-scheduler.ts`
  - `src/lib/process-task-checker.ts`
  - `src/lib/process-task-generator.ts`

**Goal files (2 files, small overlap):**

- [ ] `[LOW]` `src/lib/goal-constants.ts` and `src/lib/goal-validation.ts` — Consider merging or co-locating in `src/lib/goals/`.

**KPI files (2 files):**

- [ ] `[LOW]` `src/lib/kpi-aggregation.ts` and `src/lib/kpi-progress.ts` — Check for overlapping logic. Consider merging.

---

### 5.3 Dead Code Detection

- [ ] `[MEDIUM]` Run `npx ts-unused-exports tsconfig.json` to find unused exports across 201+ lib exports.
- [ ] `[MEDIUM]` `src/app/api/calendar/debug/` — Debug route. Remove or gate behind `NODE_ENV === 'development'`.
- [ ] `[MEDIUM]` `src/app/(app)/tasks/new-react/` — "new-react" suggests experimental/WIP page. Verify it's needed or remove.
- [ ] `[MEDIUM]` `src/app/api/admin/seed-aims/route.ts` — Verify this seeding route is not exposed in production. Should be dev-only or behind admin auth.
- [ ] `[LOW]` `src/lib/delegation.ts` (1 export) — Verify it is actually used.
- [ ] `[LOW]` `src/lib/process-animations.ts` (5 exports) — Verify animation constants are referenced.
- [ ] `[LOW]` `src/lib/html-response.ts` (1 export) — Only used by 2 complete-external routes. Consider inlining.
- [ ] `[LOW]` `src/lib/scheduling-engine.ts` (333 lines, 13 exports) — Check if all 13 exports are used.
- [ ] `[LOW]` Scan all components in `src/components/` — Verify each is imported by at least one page or other component. Remove orphaned components.

---

### 5.4 Route Simplification

- [ ] `[MEDIUM]` `src/app/api/calendar/sync/route.ts` (1,072 lines) — Extract business logic into lib functions. Route handler should be thin (parse request, call lib, return response).
- [ ] `[LOW]` `src/app/api/tasks/[id]/clear-goals/route.ts` — Has 4 HTTP methods. Verify all are needed.
- [ ] `[LOW]` Review all API route files over 200 lines — Extract business logic into `src/lib/` modules.

---

## Phase 6: Component-by-Component Review

> For each component below, check: props typing (no `any`), error boundaries, loading states, accessibility (ARIA labels, keyboard nav), and consistent Tailwind patterns.

### 6.1 Layout Components

- [ ] `src/components/layout/MainLayout.tsx`
- [ ] `src/components/layout/Sidebar.tsx`
- [ ] `src/components/layout/TopBar.tsx`
- [ ] `src/components/layout/FloatingIdeaButton.tsx`

### 6.2 Dashboard Components

- [ ] `src/components/dashboard/DashboardGreeting.tsx`
- [ ] `src/components/dashboard/DashboardTimeline.tsx`
- [ ] `src/components/dashboard/FocusView.tsx`
- [ ] `src/components/dashboard/PrismStatCard.tsx`
- [ ] `src/components/dashboard/QuickAddMenu.tsx`
- [ ] `src/components/dashboard/WinTheDayCard.tsx`

### 6.3 Task Components

- [ ] `src/components/tasks/AgendaView.tsx`
- [ ] `src/components/tasks/ClearGoalsDisplay.tsx`
- [ ] `src/components/tasks/DailyTaskList.tsx`
- [ ] `src/components/tasks/ProcessSearch.tsx`
- [ ] `src/components/tasks/StatusChip.tsx`
- [ ] `src/components/tasks/SubtaskList.tsx`
- [ ] `src/components/tasks/TaskCard.tsx`
- [ ] `src/components/tasks/TaskComments.tsx`
- [ ] `src/components/tasks/TaskCompletionKpiModal.tsx`
- [ ] `src/components/tasks/TaskEditor.tsx`

### 6.4 Goal Components

- [ ] `src/components/goals/GoalCard.tsx`
- [ ] `src/components/goals/GoalEditor.tsx`
- [ ] `src/components/goals/GoalLinkManager.tsx`
- [ ] `src/components/goals/GoalProgressBar.tsx`
- [ ] `src/components/goals/GoalStackGuide.tsx`
- [ ] `src/components/goals/GoalStackTree.tsx`
- [ ] `src/components/goals/KpiCard.tsx`
- [ ] `src/components/goals/KpiEditor.tsx`
- [ ] `src/components/goals/KpiProgressBar.tsx`
- [ ] `src/components/goals/KpiSidebar.tsx`
- [ ] `src/components/goals/TaskCardInline.tsx`
- [ ] `src/components/goals/TimeUrgencyBadge.tsx`
- [ ] `src/components/goals/YamlImportExport.tsx`

### 6.5 KPI Components

- [ ] `src/components/kpis/KpiDashboardHeader.tsx`
- [ ] `src/components/kpis/KpiDashboardSummary.tsx`
- [ ] `src/components/kpis/KpiProjection.tsx`
- [ ] `src/components/kpis/KpiSubPeriodChart.tsx`
- [ ] `src/components/kpis/ProcessKpiRow.tsx`

### 6.6 Aims Components

- [ ] `src/components/aims/AimCard.tsx`
- [ ] `src/components/aims/AimProgressChart.tsx`
- [ ] `src/components/aims/StreakHeatmap.tsx`
- [ ] `src/components/aims/WorkoutSubTypes.tsx`

### 6.7 Calendar Components

- [ ] `src/components/calendar/ActivitySelectModal.tsx`
- [ ] `src/components/calendar/CalendarSplitView.tsx`
- [ ] `src/components/calendar/CalendarView.tsx`
- [ ] `src/components/calendar/InlineCalendar.tsx`
- [ ] `src/components/calendar/MeetingsManager.tsx`
- [ ] `src/components/calendar/WeeklyHourTarget.tsx`

### 6.8 Review Components

- [ ] `src/components/reviews/MonthlyReviewWizard.tsx`
- [ ] `src/components/reviews/PeriodReviewWizard.tsx`
- [ ] `src/components/reviews/ReviewChecklist.tsx`
- [ ] `src/components/reviews/ReviewWizard.tsx`
- [ ] `src/components/reviews/WeeklyReviewWizard.tsx`
- [ ] `src/components/reviews/YearlyReviewWizard.tsx`
- [ ] `src/components/reviews/shared/DifficultiesStep.tsx`
- [ ] `src/components/reviews/shared/GoalAdjustmentStep.tsx`
- [ ] `src/components/reviews/shared/GoalCreationCoach.tsx`
- [ ] `src/components/reviews/shared/KpiProgressStep.tsx`
- [ ] `src/components/reviews/shared/NotesCompletionStep.tsx`
- [ ] `src/components/reviews/shared/OnTrackStep.tsx`
- [ ] `src/components/reviews/shared/ReviewStartupGuide.tsx`
- [ ] `src/components/reviews/shared/SuccessesAndDifficultiesStep.tsx`
- [ ] `src/components/reviews/shared/TopNTaskSelector.tsx`
- [ ] `src/components/reviews/weekly-steps/InlineTaskCreator.tsx`
- [ ] `src/components/reviews/weekly-steps/StepCalendarPlanning.tsx`
- [ ] `src/components/reviews/weekly-steps/StepCurrentGoals.tsx`
- [ ] `src/components/reviews/weekly-steps/StepDeepWorkBlocks.tsx`
- [ ] `src/components/reviews/weekly-steps/StepDifficulties.tsx`
- [ ] `src/components/reviews/weekly-steps/StepKpiProgress.tsx`
- [ ] `src/components/reviews/weekly-steps/StepMaintenanceReview.tsx`
- [ ] `src/components/reviews/weekly-steps/StepNotesCompletion.tsx`
- [ ] `src/components/reviews/weekly-steps/StepReviewTasks.tsx`
- [ ] `src/components/reviews/weekly-steps/StepScheduleTasks.tsx`
- [ ] `src/components/reviews/weekly-steps/StepTop3Tasks.tsx`
- [ ] `src/components/reviews/weekly-steps/StepWeeklyGoals.tsx`

### 6.9 Process Components

- [ ] `src/components/processes/CadenceBadge.tsx`
- [ ] `src/components/processes/DurationPicker.tsx`
- [ ] `src/components/processes/FunctionForm.tsx`
- [ ] `src/components/processes/ImportPanel.tsx`
- [ ] `src/components/processes/ProcessDetailView.tsx`
- [ ] `src/components/processes/ProcessEmptyState.tsx`
- [ ] `src/components/processes/ProcessForm.tsx`
- [ ] `src/components/processes/ProcessKpiEditor.tsx`
- [ ] `src/components/processes/ProcessKpiEntryLogger.tsx`
- [ ] `src/components/processes/ProcessKpiSection.tsx`
- [ ] `src/components/processes/ProcessSkeleton.tsx`
- [ ] `src/components/processes/ProcessTasksList.tsx`
- [ ] `src/components/processes/ScheduleFields.tsx`
- [ ] `src/components/processes/ScheduleModal.tsx`
- [ ] `src/components/processes/StepsList.tsx`

### 6.10 Powerdown Components

- [ ] `src/components/powerdown/ClearGoalGuide.tsx`
- [ ] `src/components/powerdown/PowerDownRitual.tsx`
- [ ] `src/components/powerdown/PowerDownStatusCard.tsx`

### 6.11 Dopamine/Gamification Components

- [ ] `src/components/dopamine/CompletionAnimation.tsx`
- [ ] `src/components/dopamine/ProgressRing.tsx`
- [ ] `src/components/dopamine/StreakCounter.tsx`
- [ ] `src/components/dopamine/WinTheDayCelebration.tsx`

### 6.12 Shared & UI Components

- [ ] `src/components/shared/AssigneeFilter.tsx`
- [ ] `src/components/shared/ProcessKpiLogStep.tsx`
- [ ] `src/components/ui/ConfirmDialog.tsx`
- [ ] `src/components/ui/Toast.tsx`
- [ ] `src/components/ui/ToastProvider.tsx`
- [ ] `src/components/CommandPalette.tsx`
- [ ] `src/components/ErrorBoundary.tsx`
- [ ] `src/components/ThemeProvider.tsx`

### 6.13 Onboarding

- [ ] `src/components/onboarding/OnboardingTour.tsx`

---

## Phase 7: Hooks & Utilities Review

### 7.1 Custom Hooks

> For each hook: check dependency arrays, cleanup functions, error handling, and memoization.

- [ ] `src/hooks/useCalendarEvents.ts` — SWR key stability, refresh interval appropriateness
- [ ] `src/hooks/useClickOutside.ts` — Event listener cleanup, ref typing
- [ ] `src/hooks/useKpiCompletionPrompt.ts` — State management, edge cases
- [ ] `src/hooks/useMediaQuery.ts` — SSR compatibility (window check), listener cleanup
- [ ] `src/hooks/useUserSettings.ts` — Cache invalidation, default values

### 7.2 Core Utilities

> For each: check error handling, edge cases, type safety, and test coverage.

- [ ] `src/lib/auth.ts` — (Covered in Phase 1)
- [ ] `src/lib/auth-guard.ts` — (Covered in Phase 1)
- [ ] `src/lib/api-helpers.ts` — `pickDefined`, `parsePagination`, `validateEmail`, `cacheHeaders`
- [ ] `src/lib/schemas.ts` — Zod schema completeness, reusability
- [ ] `src/lib/prisma.ts` — Singleton pattern, connection pooling
- [ ] `src/lib/crypto.ts` — (Covered in Phase 1)
- [ ] `src/lib/completion-token.ts` — (Covered in Phase 1)
- [ ] `src/lib/env-check.ts` — Required vars list completeness
- [ ] `src/lib/fetcher.ts` — Timeout handling, error format
- [ ] `src/lib/date-utils.ts` — Timezone edge cases, DST handling
- [ ] `src/lib/notifications.ts` — Multi-channel delivery, error handling, HTML escaping
- [ ] `src/lib/openrouter.ts` — Retry logic, timeout, error classification
- [ ] `src/lib/ai-prompts.ts` — Prompt injection prevention (covered in Phase 1)
- [ ] `src/lib/ai-error-handler.ts` — Error classification completeness
- [ ] `src/lib/yaml-handler.ts` — Safe loading (covered in Phase 1)
- [ ] `src/lib/mention-parser.ts` — XSS prevention (covered in Phase 1)
- [ ] `src/lib/url-validation.ts` — Sanitization completeness

### 7.3 Business Logic Utilities

- [ ] `src/lib/scheduling-engine.ts` — Algorithm correctness, edge cases (no available slots, overlapping events)
- [ ] `src/lib/streak-engine.ts` — Streak calculation accuracy, timezone handling
- [ ] `src/lib/recurrence.ts` — RRULE parsing edge cases
- [ ] `src/lib/process-scheduler.ts` — Cadence calculation accuracy
- [ ] `src/lib/process-task-generator.ts` — Idempotency, duplicate prevention
- [ ] `src/lib/process-task-checker.ts` — Race conditions, concurrent execution
- [ ] `src/lib/derailing.ts` — 6pm threshold logic, timezone awareness
- [ ] `src/lib/derail-detection.ts` — Detection accuracy, false positives
- [ ] `src/lib/derailing-checker.ts` — (Consolidation candidate, see Phase 5)
- [ ] `src/lib/progress.ts` — Cascading calculation accuracy
- [ ] `src/lib/kpi-progress.ts` — Progress math correctness
- [ ] `src/lib/kpi-aggregation.ts` — Aggregation across time levels
- [ ] `src/lib/reports.ts` — Report generation accuracy
- [ ] `src/lib/scoring.ts` — ICE score calculation
- [ ] `src/lib/aim-phases.ts` — Phase progression logic
- [ ] `src/lib/aim-history.ts` — History aggregation accuracy
- [ ] `src/lib/calendar.ts` — Google Calendar recurrence builder
- [ ] `src/lib/google-recurring-sync.ts` — Exception handling, sync reliability
- [ ] `src/lib/google-sync-state.ts` — State consistency
- [ ] `src/lib/review-dates.ts` — Date math correctness
- [ ] `src/lib/meeting-utils.ts` — Scheduling edge cases
- [ ] `src/lib/goal-constants.ts` — Constant completeness
- [ ] `src/lib/goal-validation.ts` — Hierarchy rule correctness
- [ ] `src/lib/prism-colors.ts` — Color consistency
- [ ] `src/lib/task-helpers.ts` — WTD logic (covered in Phase 2)
- [ ] `src/lib/task-utils.ts` — Utility correctness
- [ ] `src/lib/delegation.ts` — Delegation resolution logic
- [ ] `src/lib/training-helpers.ts` — Helper correctness
- [ ] `src/lib/process-constants.ts` — Constant completeness
- [ ] `src/lib/process-animations.ts` — Animation value correctness
- [ ] `src/lib/html-response.ts` — HTML escaping completeness

---

## Phase 8: Configuration & Infrastructure

### 8.1 Config Files

- [ ] `next.config.mjs` — CSP header completeness, security headers, redirect correctness
- [ ] `tailwind.config.ts` — Unused theme extensions, purge configuration
- [ ] `.eslintrc.json` — Rule strictness (upgrade `no-explicit-any` to error after Phase 4)
- [ ] `tsconfig.json` — Strict mode settings, path aliases
- [ ] `vitest.config.ts` — Test coverage configuration
- [ ] `vercel.json` — Deployment settings, function timeouts
- [ ] `docker-compose.yml` — Local dev setup correctness

### 8.2 Prisma Schema

- [ ] `prisma/schema.prisma` — Index coverage, relation cascades, field constraints, enum completeness
- [ ] `prisma/seed.ts` — Seeding idempotency, data correctness

### 8.3 Middleware

- [ ] `src/middleware.ts` — Route matching completeness, auth redirect logic, public route whitelist

---

## Phase 9: Page-Level Review

> For each page: check data fetching patterns, loading/error states, SEO metadata, and layout consistency.

- [ ] `src/app/(app)/page.tsx` — Dashboard
- [ ] `src/app/(app)/aims/page.tsx`
- [ ] `src/app/(app)/calendar/page.tsx`
- [ ] `src/app/(app)/goals/page.tsx`
- [ ] `src/app/(app)/ideas/page.tsx`
- [ ] `src/app/(app)/ideas/new/page.tsx`
- [ ] `src/app/(app)/kpis/page.tsx`
- [ ] `src/app/(app)/leaderboard/page.tsx`
- [ ] `src/app/(app)/processes/page.tsx`
- [ ] `src/app/(app)/reactive-tasks/page.tsx`
- [ ] `src/app/(app)/reactive-tasks/new/page.tsx`
- [ ] `src/app/(app)/reports/page.tsx`
- [ ] `src/app/(app)/reviews/page.tsx`
- [ ] `src/app/(app)/reviews/[id]/complete/page.tsx`
- [ ] `src/app/(app)/settings/page.tsx`
- [ ] `src/app/(app)/tasks/page.tsx`
- [ ] `src/app/(app)/tasks/new-react/page.tsx`
- [ ] `src/app/(app)/training/page.tsx`
- [ ] `src/app/(app)/powerdown/page.tsx`
- [ ] `src/app/(app)/error.tsx`
- [ ] `src/app/(auth)/login/page.tsx`
- [ ] `src/app/(auth)/accept-invite/[id]/page.tsx`
- [ ] `src/app/layout.tsx` — Root layout
- [ ] `src/app/(app)/layout.tsx` — App layout
- [ ] `src/app/(auth)/layout.tsx` — Auth layout
- [ ] `src/app/(app)/swr-provider.tsx`
- [ ] `src/app/globals.css` — Unused styles, CSS variable consistency

---

## Suggested Execution Timeline

| Week | Phase | Focus |
|------|-------|-------|
| 1 | Phase 1 (1.1-1.3) | **Security-Critical**: Fix auth debug logging, completion token fallback, add Zod schemas |
| 2 | Phase 1 (1.4-1.6) + Phase 2 | **Security + Safety**: Injection prevention, authorization audit, error handling |
| 3 | Phase 3 | **Performance**: Remove side-effects from GETs, bundle analysis, dynamic imports |
| 4 | Phase 4 | **Code Quality**: Eliminate `any` types, standardize logging, consolidate patterns |
| 5 | Phase 5 | **Simplification**: Consolidate review wizards, deduplicate libs, remove dead code |
| 6 | Phase 6-9 | **Component & Page Review**: Systematic per-file review |
