# Prism — Design Decisions

Architecture Decision Records (ADRs) documenting the "why" behind non-obvious choices. These records prevent future developers from undoing intentional decisions or re-debating settled questions.

---

## ADR 1: JWT Sessions over Database Sessions

**Decision:** Use NextAuth's JWT strategy instead of database-backed sessions.

**Context:** Prism runs on Vercel's serverless platform where each request may cold-start a new function instance. Database session lookups add latency to every request and require a DB connection before any response can be served.

**Rationale:** JWT tokens are self-contained — the server can verify identity from the token alone without hitting the database. The `userId` and `isAdmin` fields are cached in the token and only refreshed from DB every 5 minutes (via the `jwt` callback's `ADMIN_CACHE_TTL`).

**Consequences:**
- Session invalidation is eventual (up to 5-minute delay for role changes)
- `isLockedOut` flag is checked at JWT refresh, not on every request
- The PrismaAdapter is still used for OAuth account linking and user creation, but the `Session` table is effectively unused
- Token max age is 30 days for persistent sessions

---

## ADR 2: SWR over React Query

**Decision:** Use SWR for client-side data fetching instead of TanStack React Query.

**Context:** Needed a data fetching library with caching, deduplication, and revalidation. Both SWR and React Query are mature options.

**Rationale:** SWR has a simpler API, a smaller bundle size, and is sufficient for Prism's use case. The app doesn't need React Query's more advanced features (infinite queries, complex mutation management, query invalidation hierarchies). SWR's stale-while-revalidate pattern maps naturally to the app's read-heavy, write-occasional pattern.

**Consequences:**
- Global config in `swr-provider.tsx`: `revalidateOnFocus: false`, `dedupingInterval: 5000`, `errorRetryCount: 2`
- After mutations, manual `mutate()` calls revalidate affected cache keys
- No global state management (Redux, Zustand, Context) — SWR cache is the shared state

---

## ADR 3: Feature-Organized Components over Atomic Design

**Decision:** Organize components by feature domain (`components/goals/`, `components/tasks/`) rather than by type (`components/atoms/`, `components/molecules/`).

**Context:** With 100+ components, a clear organization strategy is essential. Atomic design (atoms/molecules/organisms) and feature-based are the two main approaches.

**Rationale:** Prism is a single application with distinct feature domains (goals, tasks, reviews, calendar, etc.). Feature organization keeps related components together — when working on goals, everything you need is in `components/goals/`. This provides better domain cohesion than atomic design, which scatters a feature's components across multiple directories.

**Consequences:**
- `components/goals/` contains GoalStackTree, GoalCard, GoalEditor, GoalProgressBar, KpiCard, etc.
- Shared UI primitives live in `components/ui/` (Toast, ConfirmDialog)
- Layout components live in `components/layout/` (MainLayout, Sidebar, TopBar)
- New features get their own directory

---

## ADR 4: Prisma adapter-pg for Serverless

**Decision:** Use `@prisma/adapter-pg` with the `pg` driver instead of Prisma's default client.

**Context:** Vercel serverless functions can spawn many concurrent instances, each opening its own database connection. PostgreSQL has a connection limit, and default Prisma client can exhaust it with "too many connections" errors.

**Rationale:** `@prisma/adapter-pg` provides explicit connection pooling (configured to max 5 connections). The `pg` driver handles connection lifecycle properly in serverless environments, reusing connections within a function and releasing them on cold start.

**Consequences:**
- `prisma.ts` creates a singleton client with the pg adapter
- Connection string format must be compatible with the `pg` driver
- Max 5 concurrent connections per function instance

---

## ADR 5: Centralized Color System

**Decision:** All item type colors are defined in a single file (`src/lib/prism-colors.ts`) and imported everywhere.

**Context:** Prism has 8 distinct item types (Improve, React, Maintenance, AIM, Review, Google Calendar, Power Down, Meeting) that appear across the calendar, dashboard, task lists, review wizards, and reports. Colors must be consistent everywhere.

**Rationale:** A centralized color system with typed definitions prevents color drift. Each `ColorDef` includes hex, emoji, translucent background, border, and three Tailwind classes (text, bg, border). Components import the definition and use its properties — no hardcoded hex values or Tailwind color classes for item types.

**Consequences:**
- `PRISM_COLORS` record maps `ItemType` to `ColorDef`
- Helper functions: `taskTypeToColorKey()`, `getTaskTypeColor()`
- Any color change to an item type is a single-line edit in one file
- Components must import from `prism-colors.ts`, never hardcode `bg-indigo-500` for task colors

---

## ADR 6: Glass-Morphism Design Language

**Decision:** Use glass-morphism (translucent backgrounds, backdrop blur, noise overlay) as the primary design language.

**Context:** Prism needed a distinctive visual identity beyond standard Tailwind UI that would work in both light and dark themes and support the app's vibrant color system.

**Rationale:** Glass-morphism provides visual depth without heavy drop shadows. Translucent backgrounds allow the color system to show through, creating a cohesive look when multiple item types appear on screen (e.g., calendar view with mixed task types). The noise overlay adds subtle texture that prevents the glass effect from looking flat.

**Consequences:**
- `MainLayout.tsx` includes a noise overlay div
- All color definitions in `prism-colors.ts` include translucent `bg` values (e.g., `rgba(99,102,241,0.15)`)
- Card components use `bg-white/5 border border-white/10` pattern
- Dark mode uses `bg-gray-950` base with translucent overlays

---

## ADR 7: Multi-Step Wizards for Reviews and Power Down

**Decision:** Reviews and Power Down use multi-step wizard flows with per-step answer storage.

**Context:** Weekly reviews have 11 steps, monthly reviews have 9 steps, Power Down has 9 steps. Each step involves distinct activities (reflection, task creation, calendar scheduling, ranking).

**Rationale:** Showing all steps on one page would be overwhelming. The wizard pattern reduces cognitive load by presenting one step at a time, saves progress per step (allowing users to resume if interrupted), and guides users through a structured process. The `ReviewAnswer` model stores each step's response separately, enabling step-level persistence and non-linear navigation.

**Consequences:**
- Wizard state is managed via `checklistState` JSON on Review/PowerdownSession
- Each step's response is stored as a `ReviewAnswer` with `stepKey` and `answerData`
- Steps can have validation requirements (must save before advancing)
- Power Down's `tomorrowPlan`, `distractions`, `gratitudes`, `ideas`, `clearGoals` are stored as separate JSON fields

---

## ADR 8: Task Type Mapping (IMPROVE = GOAL_STACK in DB)

**Decision:** The user-facing task type "Improve" maps to `GOAL_STACK` in the database via Prisma's `@map` directive.

**Context:** The original task type was called "Goal Stack" in the database. User testing showed that "Improve" is a more intuitive label — it immediately communicates that this task type moves goals forward.

**Rationale:** Renaming in the database would require a migration and risk breaking existing data. Prisma's `@map` allows the code to use the friendly name (`IMPROVE`) while the database retains the original value (`GOAL_STACK`). This is a zero-risk rename.

**Consequences:**
- TypeScript code uses `TaskType.IMPROVE`
- Database stores `GOAL_STACK`
- API responses return `IMPROVE` (Prisma handles the mapping)
- Any raw SQL queries must use `GOAL_STACK`

---

## ADR 9: Encrypted Google Refresh Tokens

**Decision:** Google OAuth refresh tokens are encrypted at rest using AES-256-GCM.

**Context:** Google refresh tokens grant long-lived access to users' calendars. If the database is compromised, plaintext refresh tokens would allow attackers to read and modify all users' calendars.

**Rationale:** AES-256-GCM provides authenticated encryption — both confidentiality and integrity. The encryption key (`TOKEN_ENCRYPTION_KEY`) is stored as an environment variable, separate from the database. Even with full database access, tokens are unreadable without the key.

**Consequences:**
- `src/lib/crypto.ts` implements `encryptToken()` and `decryptToken()`
- Token format: `iv:authTag:ciphertext` (all hex)
- Key must be a 64-character hex string (32 bytes)
- Fallback path: `decryptToken()` returns `null` on failure; `src/lib/calendar.ts` handles pre-encryption plaintext tokens gracefully
- Key rotation requires decrypting all tokens with the old key and re-encrypting with the new one

---

## ADR 10: Timing-Safe Cron Secret Verification

**Decision:** Cron endpoint authentication uses HMAC + `timingSafeEqual` instead of direct string comparison.

**Context:** Cron endpoints (`/api/cron/*`) authenticate via an `Authorization: Bearer <secret>` header. The secret must be verified without leaking timing information.

**Rationale:** Direct string comparison (`===`) can leak the secret length and correct prefix through timing side channels. HMAC comparison with `timingSafeEqual` ensures constant-time comparison regardless of where strings differ. The HMAC step normalizes both values to fixed-length digests, preventing length-based timing leaks.

**Consequences:**
- `requireCronSecret()` in `auth-guard.ts` uses `createHmac('sha256', key)` on both values
- `timingSafeEqual` compares the HMAC digests
- No secret configured (`!process.env.CRON_SECRET`) = deny all requests
- Cron paths are excluded from the NextAuth middleware matcher

---

## ADR 11: Soft Deletes for Goals Only

**Decision:** Goals use soft delete (`deletedAt` timestamp). All other entities use hard delete.

**Context:** Goals are high-value data — they represent a user's vision, strategy, and progress hierarchy. Other entities (tasks, comments, attachments) are more transient.

**Rationale:** Soft delete for goals enables recovery of accidentally deleted goals and their cascading children. Applying soft deletes to all entities would add complexity (every query needs `WHERE deletedAt IS NULL`) without proportional benefit. Tasks, comments, and other transient data don't warrant the overhead.

**Consequences:**
- Goal model has `deletedAt DateTime?` field with an index
- **All Goal queries must filter `deletedAt: null`** to exclude soft-deleted goals
- Hard delete is used for tasks, reviews, comments, attachments, etc.
- No scheduled cleanup of soft-deleted goals (manual admin task if needed)

---

## ADR 12: Power Down Dark Theme Override

**Decision:** The Power Down page forces dark theme regardless of the user's app-wide theme setting.

**Context:** Power Down is an evening shutdown ritual. The visual experience should signal "winding down" and be comfortable for evening use.

**Rationale:** Inspired by Cal Newport's "shutdown complete" concept, the dark theme creates a clear visual boundary between work mode and rest mode. A bright screen at 8 PM contradicts the ritual's purpose. The override is intentional — users don't need to manually switch themes before their evening routine.

**Consequences:**
- Power Down page components use dark-specific Tailwind classes
- Theme override is applied at the page level, not globally
- Dark mode auto-switch can be enabled in Settings for the entire app at Power Down time
- Moon icon and muted colors reinforce the nighttime association

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — How these decisions shape the system design
- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — Practical implications of these decisions for development
