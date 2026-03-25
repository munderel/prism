# Goal Dashboard App — Design Spec

## Purpose

Dopaminergic goal management dashboard for a small team (2-10). Core concept: **Goal Stack** hierarchy (High Hard Goal → daily tasks) with config-driven import/export for AI-assisted strategy. Three task types, review cadences, power-down ritual, Google Calendar integration, derailing alerts, reports, and onboarding. Each person has a private **MTP (Massively Transformative Purpose)** alongside the company MTP.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Fullstack | Next.js 14 (App Router) + TypeScript |
| Database | PostgreSQL + Prisma ORM (`prisma migrate dev`) |
| Auth | next-auth v4 (Google provider) + `auth-guard.ts` middleware |
| Styling | TailwindCSS + Framer Motion (mobile-first) |
| Calendar UI | FullCalendar React + Google Calendar plugin |
| Calendar API | Google Calendar API via `googleapis` (sync + Meet links) |
| Charts | Recharts |
| Tree Editor | @dnd-kit/core + @dnd-kit/sortable + custom tree |
| Notifications | `web-push` + `nodemailer` |
| Scheduling | Vercel Cron Jobs (`vercel.json`) |
| Onboarding | `driver.js` |
| Testing | Vitest (API route tests) |
| Deployment | Vercel (app) + Supabase/Railway (PostgreSQL) |

---

## Authorization Model

### Admin Role

`User.isAdmin: Boolean @default(false)` — first user to sign up is auto-promoted to admin.

### Access Rules

| Resource | Read | Write/Delete |
|----------|------|-------------|
| Company GoalStack | All team members | Admin only |
| Company MTP | All team members | Admin only |
| CompanySettings | All team members | Admin only |
| Promote users | — | Admin only |
| Individual GoalStack | Owner only | Owner only |
| Tasks | Owner only | Owner only |
| Reviews / Powerdown | Owner only | Owner only |
| Streaks | Own = full, others = leaderboard | Owner only |
| Task Comments | Task owner + @mentioned + admins | Author only |
| Reports (individual) | Owner only | — |
| Reports (company) | All team members | — |

Every API route enforces these rules via `auth-guard.ts`. Every Prisma query includes ownership/admin filters.

**Rate limiting:** `src/lib/rate-limit.ts` provides a simple in-memory rate limiter (sliding window, per-IP). Applied to write-heavy routes: `/api/comments` (20 req/min), `/api/notifications` (10 req/min), `/api/tasks` (30 req/min). Uses Vercel's `x-forwarded-for` header for IP identification. Lightweight — no Redis needed for a 2-10 person team.

**Error boundaries:** A root `ErrorBoundary` component wraps the app in `layout.tsx`. Each page also has a Next.js `error.tsx` file for per-page error handling. Unhandled errors show a friendly "Something went wrong" UI with a retry button instead of crashing the entire app.

**Cron route security:** Cron routes (`/api/cron/*`) do not use session auth. Instead, they validate a `CRON_SECRET` header (`Authorization: Bearer <CRON_SECRET>`) set as a Vercel environment variable. Vercel automatically sends this header on cron invocations. Requests without a valid secret return 401.

**Company GoalStack creation:** The `isCompany` field on GoalStack is enforced server-side — `auth-guard.ts` rejects any request to create or update a GoalStack with `isCompany: true` unless the user is an admin.

---

## Database Schema (16 Models)

### Core
1. **User** — id, email, name, image, googleRefreshToken, googleTokenExpiresAt (DateTime nullable), mtp (nullable, private), isAdmin (default false), hasCompletedOnboarding (default false), timezone (String default "America/New_York"), accounts/sessions (NextAuth)
2. **CompanySettings** — id, companyMtp (nullable), timestamps
3. **GoalStack** — id, ownerId (FK User), name, isCompany (bool), timestamps
4. **Goal** — id, stackId (FK GoalStack), parentId (FK self, nullable), level (HIGH_HARD/STRATEGIC/MONTHLY/WEEKLY/DAILY), title, description, status, progressPct, dueDate, sortOrder, deletedAt (DateTime nullable — soft delete for YAML import reconciliation), timestamps
5. **GoalLink** — id, companyGoalId (FK Goal), individualGoalId (FK Goal), weight (Float default 1.0), createdAt. *Note: the assigned user is derived from `individualGoal.stack.ownerId` — no denormalized `assignedUserId` to avoid drift.*

### Tasks & Tracking
6. **Task** — id, ownerId (FK User), goalId (FK Goal, nullable), taskType (GOAL_STACK/REACT/MAINTENANCE), title, description, status (TODO/IN_PROGRESS/DONE/DROPPED), priority, dueDate, recurrenceRule (iCal RRULE), calendarEventId, timeBlockStart/End, startedAt (nullable), completedAt, failedAt (nullable), rescheduledTo (nullable), timestamps
7. **Streak** — id, userId (FK User), streakType, currentCount, bestCount, lastActiveDate
8. **PublicWin** — id, userId (FK User), goalId/taskId (nullable), message, createdAt

### Rituals & Reviews
9. **Review** — id, userId (FK User), reviewType (WEEKLY/MONTHLY/QUARTERLY/YEARLY), scheduledDate, completedAt, notes, checklistState (Json)
10. **ReviewTemplate** — id, reviewType, checklistItems (Json), processSteps (Json)
11. **PowerdownSession** — id, userId (FK User), sessionDate, currentStep (Int default 1), checklistState (Json), tomorrowPlan (Json), completedAt

### Collaboration
12. **TaskComment** — id, taskId (FK Task, required), authorId (FK User), content (Text), createdAt
13. **CommentMention** — id, commentId (FK TaskComment), userId (FK User). Join table indexed on userId.

### Notifications
14. **PushSubscription** — id, userId (FK User), endpoint (String), p256dh (String), auth (String), createdAt. Stores web-push subscription per device. Users may have multiple (phone + laptop).
15. **NotificationPreference** — id, userId (FK User), emailEnabled (Boolean default true), pushEnabled (Boolean default true), derailingAlerts (Boolean default true), mentionAlerts (Boolean default true), reviewNags (Boolean default true)

### Versioning
16. **ConfigVersion** — id, stackId (FK GoalStack), versionNum, yamlContent, changeSummary, createdById (FK User), createdAt

> 16 models total. All former JSON arrays replaced with proper join tables.

**Seed script:** `prisma/seed.ts` seeds ReviewTemplate records (one per cadence type: WEEKLY, MONTHLY, QUARTERLY, YEARLY) with default checklist items and process steps. Run via `npx prisma db seed`. Configured in `package.json` under `"prisma": { "seed": "ts-node prisma/seed.ts" }`. Also seeds a default CompanySettings row.

**Soft deletes:** Goals use `deletedAt` for soft deletion (used by YAML import reconciliation). All Goal queries filter `WHERE deletedAt IS NULL` by default. Soft-deleted goals can be restored from the YAML import diff UI.

---

## Key Features

### 1. In-App Goal Stack Editor
- Tree view with inline editing (dnd-kit for drag reorder/reparent)
- Add goal buttons at each level
- Right-click context menu: edit, delete, link to company goal, break down into sub-goals
- Config upload/download buttons (YAML for AI tool round-trips)
- Both UI edits and config imports write to the same DB; imports create ConfigVersion entries

### 2. Three Task Types
- **Goal Stack Tasks** — derived from goal hierarchy, labeled with parent goal
- **React Tasks** — emergencies/one-offs
- **Maintenance Tasks** — recurring (iCal RRULE), labeled "recurring"
- Task lifecycle: TODO → (click Start → IN_PROGRESS) → DONE/DROPPED
- `startedAt` timestamp drives derailing logic
- **Recurrence generation:** When a recurring maintenance task is completed (or dropped), the system immediately creates the next occurrence based on the RRULE (e.g., if weekly, creates a new task due next week). The power-down ritual also generates any missing future occurrences for the next day. No cron job — recurrence is event-driven.

### 3. Comprehensive Dashboard
Home page shows all tasks for today grouped into 3 collapsible sections (goal-stack, react, maintenance) with count badges. Tasks can be checked off inline (triggers dopamine animations + progress rollup).

### 4. Calendar Page
FullCalendar with week/month/day views and filter toggles:
- **My Tasks** — time-blocked tasks
- **Review Cadence** — weekly/monthly/quarterly/yearly markers
- **Google Calendar** — synced events (read) + created events with Meet links (write)
- Click any day for full task list. Drag tasks to reschedule.

### 5. Google Calendar + Meet Integration
No separate meeting system. Creating events with `conferenceData` auto-generates Google Meet links. Events appear in both the app calendar and Google Calendar. Click to join.

**Token lifecycle:** `googleapis` handles refresh token rotation automatically. If a refresh fails (user revoked access, token expired after 6 months of inactivity), the calendar API calls return a specific error. The app catches this and shows a "Reconnect Google Calendar" banner with a one-click re-auth flow (redirects through NextAuth Google provider). Calendar features degrade gracefully — local task time blocks still work, but sync and Meet link generation are disabled until re-authorized.

### 6. Review Cadence with Checklists
- Weekly (Sunday), Monthly (1st Monday), Quarterly (Jan/Apr/Jul/Oct), Yearly (January)
- Each review type has a ReviewTemplate with process guide + checklist
- Checklist state saves as you go (can pause/resume)
- Review is complete only when all items checked
- Overdue reviews trigger nag notifications via Vercel Cron
- **New user scheduling:** When a user first signs up, their first review of each type is scheduled for the next upcoming occurrence (not retroactively). No overdue reviews are created for periods before the user existed.
- **Overdue accumulation:** If a review is never completed, it stays overdue (one instance). The system does not create additional review instances until the overdue one is completed or explicitly skipped. The cron nag fires once per day for each overdue review.

### 7. Power-Down Ritual (6-Step Wizard)
1. Review completions
2. Capture loose ends → create react tasks
3. Reschedule incomplete tasks (move to tomorrow / date / close as done / close as dropped + adjust goal stack)
4. Set tomorrow's focus (break weekly goals into daily tasks)
5. Assign time blocks → push to Google Calendar
6. Clear inbox → Power Down Complete → confetti + streak update

**Wizard state:** `PowerdownSession.currentStep` (Int, 1-6) tracks progress. If the user closes mid-wizard, they can resume from where they left off. If the Google Calendar push in step 5 fails, the user sees an error with "Retry" and "Skip" options — the wizard does not block. Step state is persisted after each step completes.

### 8. Derailing Alerts
`src/lib/derailing.ts` — checked via Vercel Cron + on dashboard load. **All thresholds evaluated in the user's local timezone** (stored as `User.timezone`, e.g., "America/New_York"). Converted using `date-fns-tz` at check time.

- **At risk (orange)**: daily task with status=TODO, past 2pm user-local time
- **Derailing (red)**: daily task with status!=DONE, past 6pm user-local time → push + email
- **Streak at risk**: no completions today, past noon user-local time → flame pulse
- Dashboard shows derailing banner. Task cards show status indicators.

### 9. Task Comments + @Mentions
- Each task has a comment thread (TaskComment with required taskId FK)
- @mention autocomplete from team members
- Mentions stored in CommentMention join table (indexed on userId)
- @mentioned users get push + email notification
- **Visibility rule:** On company goal tasks (where the parent GoalStack has `isCompany=true`), comments are visible to all team members. On individual tasks, comments are visible to the task owner + admins. When a user is @mentioned on an individual task, they gain **full read access to that task** (title, status, details, all comments). This keeps it simple — mentioning someone is an explicit invitation to see the task. Enforced in the comments and tasks API routes.

### 10. Reports
**Individual:** completion rate, failure rate, streak history, goal progress over time, breakdown by task type (Recharts).
**Company:** team-wide completion, per-person comparison, company goal progress (via GoalLink contributions), overdue review count, leverage analysis (maintenance tasks sorted by frequency with automate/delegate/eliminate flags).

### 11. MTP (Massively Transformative Purpose)
- Individual MTP: private, on User model, shown at top of personal dashboard
- Company MTP: on CompanySettings, shown on company dashboard + leaderboard header
- Both editable in Settings (company MTP admin-only)

### 12. Onboarding
`driver.js` tour triggered on first login. Walks through: Sidebar → Dashboard → Goal Stack → Tasks → Power-Down → Calendar → Settings. Skippable, re-triggerable from Settings. Ends with prompt to set MTP + create first goal stack.

### 13. Dopaminergic UX

| Element | Implementation |
|---------|---------------|
| Progress rings | SVG circle, HSL interpolation (red→yellow→green) |
| Progress bars | Horizontal on goal tree, same color system |
| Streak counter | Flame icon, spring bounce on increment, orange pulse at risk |
| Completion animation | Card shrinks + checkmark + pulse. Last task of day → confetti |
| Derailing banner | Red pulsing banner at dashboard top |
| Goal tree colors | Level-coded: purple (HHG) → indigo → blue → teal → green. Gold glow on completion |
| Leaderboard | Ranked by: streak, tasks completed, reviews on time. Animated rank changes |
| Public wins feed | Auto-created on goal completion, streak milestones. Slides in from right |

---

## Company ↔ Individual Goal Linking

A company goal can have multiple individual goals linked via GoalLink (with weight). Progress rollup:
1. Individual marks task complete → their goal's progressPct updates
2. System finds GoalLink rows → gets companyGoalId
3. Company goal recalculates: `progressPct = weighted_avg(linked individual goals)`
4. Cascades up company goal stack hierarchy

**Rollup algorithm (precise):**
- **Leaf goals** (no children): progressPct is set directly by task completion (completed tasks / total tasks under this goal, as a percentage)
- **Parent goals**: `progressPct = average(children progressPct values)` — simple unweighted average of direct children
- **Company goals with GoalLinks**: `progressPct = sum(linked_goal.progressPct * link.weight) / sum(link.weights)` — weighted average across all linked individual goals
- **Goals with zero children and zero links**: progressPct = 0% (not excluded from parent calculation)
- Rollup is triggered on every task completion and cascades upward synchronously in the same API request

UI: Company view shows linked assignee avatars + progress bars. Individual view shows "contributes to: [company goal]".

---

## Goal Stack Config (YAML)

```yaml
meta:
  name: "Q2 2026 Revenue Growth"
  owner: "user@example.com"
  is_company: true
  exported_at: "2026-03-21T10:00:00Z"
  mtp: "Democratize access to growth for every small business"
  links:
    - company_goal: "Post 200 videos"
      individual_goals:
        - user: "personA@example.com"
          goal: "Post 50 videos for Channel X"
high_hard_goal:
  title: "Reach $1M ARR by Dec 2026"
  strategic_goals:
    - title: "Double inbound pipeline"
      monthly_goals:
        - title: "Launch SEO campaign"
          weekly_goals:
            - title: "Keyword research"
              daily_goals:
                - title: "Identify 50 target keywords"
                  date: "2026-04-07"
```

Version control: Export → modify externally (or via AI) → re-upload → validates, diffs, reconciles goal tree + links. Each import creates a ConfigVersion.

**YAML import conflict resolution:**
- Import compares the uploaded YAML against the current DB state (not the previous ConfigVersion)
- **New goals** in YAML (no matching title at same level): created
- **Deleted goals** (exist in DB but not in YAML): marked as deleted (soft delete) with a confirmation prompt — "These goals exist in the app but not in your file: [list]. Delete them?"
- **Modified goals** (same title, different fields): YAML values overwrite DB values (last-write-wins). The diff is shown to the user before confirming import.
- **Structural changes** (goal moved to different parent): applied as a reparent operation
- The import UI shows a diff preview before committing. User must confirm.

---

## Directory Structure

```
goal-dashboard/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── vercel.json                  # Cron config
├── vitest.config.ts             # Test config
├── .env.local
├── .env.example                 # All required env vars with empty values (committed)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                  # Seeds ReviewTemplates + CompanySettings
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Dashboard
│   │   ├── login/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── goals/page.tsx
│   │   ├── tasks/page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── reviews/page.tsx
│   │   ├── powerdown/page.tsx
│   │   ├── leaderboard/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── stacks/
│   │       ├── goals/
│   │       ├── tasks/
│   │       ├── comments/
│   │       ├── reviews/
│   │       ├── powerdown/
│   │       ├── streaks/
│   │       ├── reports/
│   │       ├── calendar/
│   │       ├── notifications/
│   │       ├── admin/
│   │       ├── cron/
│   │       │   ├── derailing/route.ts
│   │       │   └── review-nag/route.ts
│   │       └── settings/
│   ├── components/
│   │   ├── ErrorBoundary.tsx     # Root error boundary (catches unhandled React errors)
│   │   ├── layout/              # Sidebar, TopBar, MainLayout
│   │   ├── onboarding/          # OnboardingTour, WelcomeModal
│   │   ├── goals/               # GoalStackTree, GoalCard, GoalEditor, GoalProgressBar, GoalConfigUpload
│   │   ├── tasks/               # TaskBoard, TaskCard, DailyGoalCreator, DailyTaskList
│   │   ├── comments/            # CommentThread, MentionInput
│   │   ├── calendar/            # CalendarView, EventCard
│   │   ├── reviews/             # ReviewSchedule, ReviewChecklist, ReviewProcess
│   │   ├── powerdown/           # PowerDownRitual, ReschedulePanel
│   │   ├── reports/             # CompletionReport, FailureReport, LeverageAnalysis
│   │   ├── dopamine/            # StreakCounter, CompletionAnimation, ProgressRing, Confetti
│   │   ├── leaderboard/         # TeamLeaderboard, PublicWinsFeed
│   │   └── settings/            # MTPEditor, AdminPanel
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── auth-guard.ts
│   │   ├── rate-limit.ts        # Simple in-memory rate limiter for API routes
│   │   ├── calendar.ts
│   │   ├── notifications.ts
│   │   ├── derailing.ts
│   │   ├── yaml-handler.ts
│   │   ├── progress.ts
│   │   └── reports.ts
│   ├── hooks/
│   ├── types/
│   └── __tests__/
└── public/
```

---

## Dependencies

### Production
```
next, react, react-dom, typescript, tailwindcss, framer-motion,
@prisma/client, prisma, next-auth, @auth/prisma-adapter,
googleapis, js-yaml, canvas-confetti, web-push, nodemailer,
@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities,
@fullcalendar/react, @fullcalendar/daygrid, @fullcalendar/timegrid,
@fullcalendar/interaction, @fullcalendar/google-calendar,
recharts, lucide-react, date-fns, date-fns-tz, driver.js
```

### Dev
```
vitest, @vitejs/plugin-react
```

---

## Build Phases

### Phase 1 — Foundation
1. Create Next.js 14 app + Docker Compose (PostgreSQL for local dev)
2. Init git → GitHub → `.gitignore` + `.env.example` → push
3. Prisma schema (16 models + join tables) + `prisma migrate dev`
4. `prisma/seed.ts` — seed ReviewTemplates (4 cadences) + default CompanySettings
5. NextAuth v4 + Google OAuth + session provider
6. `auth-guard.ts` (session check + ownership + admin check) + `rate-limit.ts`
7. Root layout + sidebar navigation + root `ErrorBoundary` + per-page `error.tsx`
8. Login page
9. Deploy to Vercel — connect GitHub, set env vars, verify live

**Tests:** Auth guard middleware (session mock, ownership, admin check), rate limiter
**Verify:** Sign in on deployed URL, tables exist in hosted PostgreSQL, seed data present

### Phase 2 — Goal Stack Core
1. GoalStack + Goal CRUD API routes (with auth guard)
2. In-app goal stack editor (dnd-kit tree + inline editing)
3. Goal linking API (company ↔ individual via GoalLink)
4. YAML export/import + ConfigVersion versioning
5. Progress rollup logic (individual → company via weighted links)

**Tests:** Goal CRUD, linking, progress rollup calculation, YAML import/export validation
**Verify:** Create/edit goals in-app, link to company goals, export/import YAML, admin-only company edits

### Phase 3 — Task System + Comments
1. Task CRUD (all 3 types)
2. Task completion → goal rollup → company rollup via links
3. Maintenance task recurrence (iCal RRULE)
4. Comprehensive daily task list on dashboard (3 sections)
5. Task board (3 columns by type)
6. Task comments + @mentions (TaskComment CRUD, CommentMention, @autocomplete)
7. Comment notification triggers (stored, sent in Phase 9)

**Tests:** Task CRUD, completion rollup, recurrence generation, comment creation + mention parsing
**Verify:** Create all 3 types, complete, see cascading progress, add comments with @mentions

### Phase 4 — Calendar & Scheduling
1. FullCalendar page (week/month/day views + filter toggles)
2. Google Calendar sync (read events + write events with Meet links)
3. Task time blocking + drag-to-reschedule
4. Create event with Google Meet link

**Tests:** Calendar event creation, Google Calendar API mocking, time block assignment
**Verify:** Tasks on calendar, filter toggles, drag reschedule, Google Calendar sync + Meet links

### Phase 5 — Reviews & Power-Down
1. ReviewTemplate seed data (checklist + process for each cadence)
2. Review page with interactive checklist + process guide
3. Power-down 6-step wizard (including reschedule step)
4. Review scheduling logic (auto-create next review on completion)

**Tests:** Review creation, checklist state persistence, power-down task rescheduling
**Verify:** Complete a review with checklist, run full power-down, next review auto-scheduled

### Phase 6 — Dopamine & Derailing
1. Streak tracking (daily completion streaks)
2. Animations: StreakCounter, ProgressRing, CompletionAnimation, Confetti
3. Derailing detection logic (`derailing.ts`)
4. Derailing banner + per-task status indicators
5. Leaderboard + PublicWin auto-generation

**Tests:** Derailing detection (time-based scenarios), streak increment/reset
**Verify:** Complete tasks → animations, leave task past 2pm → orange, past 6pm → red

### Phase 7 — Reports & Analytics
1. Individual reports (Recharts: completion rate, failure rate, streak history)
2. Company reports (team completion, per-person, GoalLink contribution)
3. Maintenance task leverage view (automate/delegate/eliminate flags)

**Tests:** Report calculation logic (completion %, failure %, leverage ranking)
**Verify:** Reports show accurate data, charts render, leverage view sorts correctly

### Phase 8 — Settings, MTP & Onboarding
1. Settings page (MTP editor, notification prefs, calendar toggle)
2. Company MTP in CompanySettings (admin-only edit)
3. Admin panel: promote/demote users
4. Onboarding tour with `driver.js`

**Tests:** Admin promotion/demotion, MTP update (admin vs non-admin), onboarding flag toggle
**Verify:** Set MTP, run onboarding tour, skip + re-trigger, admin can promote users

### Phase 9 — Notifications, Cron & Polish
1. Browser push (`web-push`) + email (`nodemailer`) notifications
2. Vercel Cron routes in `vercel.json` (derailing checks + review nags + @mention digests)
3. Mobile-responsive pass (sidebar → bottom nav, task board → stacked, calendar → day view default on mobile)
4. Loading states, error handling, touch-friendly targets
5. Security review (input sanitization for comments, XSS prevention)

**Tests:** Cron route logic (derailing detection at different times), notification dispatch
**Verify:** Push + email notifications, derailing alerts via cron, test on mobile viewport (375px / 768px / 1280px)

---

## Verification Plan

1. **Auth + Onboarding:** Sign in → onboarding tour → set MTP → skip → re-trigger from settings
2. **Goal Stack (in-app):** Create stack → add goals via tree editor → rename inline → drag reorder → link to company goal (admin only)
3. **Goal Stack (config):** Export YAML → edit → re-import → verify diff + reconciliation
4. **Tasks:** Create all 3 types → dashboard unified daily list → click Start → complete → progress cascades to company goal
5. **Comments:** Add comment on task → @mention teammate → they see notification
6. **Calendar:** Tasks on calendar → filter toggles → drag reschedule → Google Calendar sync + Meet links → click to join
7. **Reviews:** Weekly review due → process guide + checklist → complete all items → next review auto-scheduled
8. **Power-Down:** Full 6-step ritual → reschedule incomplete → set tomorrow → push to calendar → confetti
9. **Derailing:** Leave task not started past 2pm → orange → past 6pm → red alert + push
10. **Reports:** Individual shows completion/failure rates → company shows team data + leverage analysis
11. **MTP:** Set individual (private) → set company (admin only) → both display on dashboards
12. **Admin:** First user is admin → promote another user → they can edit company goals
