# Prism — API Reference

*130+ API route handlers across 22+ domain areas*

## General Conventions

| Aspect | Convention |
|--------|-----------|
| Base URL | `/api` |
| Authentication | All endpoints require valid NextAuth JWT session (exceptions noted) |
| Request format | JSON body for POST/PUT/PATCH, query params for GET |
| Response format | JSON with `Cache-Control` headers on GET responses |
| Error format | `{ "error": "message" }` with appropriate HTTP status |
| Pagination | `?page=1&limit=20` (max 100) where supported |
| Date format | `YYYY-MM-DD` for date-only, ISO 8601 for datetime |
| Auth guard | `requireAuth()` returns `{ session, userId }` or 401 |

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (no valid session) |
| 403 | Forbidden (not owner/admin) |
| 404 | Not found |
| 409 | Conflict (duplicate resource) |
| 429 | Rate limit exceeded (see Rate Limiting below) |

### Rate Limiting

High-volume mutation routes are rate-limited per user via a DB-backed sliding
window (`enforceRateLimit` in `src/lib/rate-limit.ts`, backed by the
`RateLimitEvent` table). Limits are deliberately generous — normal UI usage,
SWR retry bursts, and YAML imports never hit them; they exist to stop runaway
scripts and abuse. Over the limit, the route returns
`429 { "error": "Rate limit exceeded. Please wait a moment and try again." }`.

| Route(s) | Limit |
|----------|-------|
| `POST /api/tasks` | 120 / 5 min per user |
| `POST /api/goals` | 120 / 5 min per user |
| `POST /api/processes` | 120 / 5 min per admin |
| `POST /api/calendar` | 120 / 5 min per user |
| `PATCH`/`DELETE /api/calendar/events/[id]` | 120 / 5 min per user (shared budget) |
| `POST /api/auth/register` | 5 / hour per email (inline `LoginAttempt` counter) |
| `POST /api/invitations` | 10 / hour per admin (inline `Invitation` counter) |

GET routes are never rate-limited.

---

## Authentication & Users

### `POST /api/auth/register`
**Auth:** None (but requires valid invitation)

Create a new user account with password.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password (will be hashed) |
| `name` | string | Yes | Display name |
| `invitationId` | string | Yes | Valid pending invitation ID |

### `POST /api/auth/setup-2fa`
**Auth:** Authenticated user

Generate TOTP secret and QR code for 2FA setup.

**Response:** `{ secret, qrCodeUrl, otpauthUrl }`

### `[...nextauth]` — NextAuth Catch-All
**Path:** `/api/auth/[...nextauth]`
**Auth:** Managed by NextAuth

Handles Google OAuth callbacks, credential login, session management.

### `GET /api/settings`
**Auth:** Authenticated user

Returns current user's settings (timezone, hiddenFeatures, workingHours, etc.).

### `PUT /api/settings`
**Auth:** Authenticated user

Update user settings.

| Body Field | Type | Description |
|-----------|------|-------------|
| `timezone` | string | IANA timezone |
| `hiddenFeatures` | string[] | Hidden sidebar feature IDs |
| `workingHoursStart` | string | `"HH:mm"` format |
| `workingHoursEnd` | string | `"HH:mm"` format |
| `casualHoursStart` | string | `"HH:mm"` format |
| `casualHoursEnd` | string | `"HH:mm"` format |
| `powerdownTime` | string | `"HH:mm"` format |
| `mtp` | string | Massive Transformative Purpose |

### `GET /api/settings/auth`
**Auth:** Admin

Get company auth settings (2FA enforcement).

### `PUT /api/settings/auth`
**Auth:** Admin

Update company auth settings.

| Body Field | Type | Description |
|-----------|------|-------------|
| `enforce2FA` | boolean | Require 2FA for all users |

### `GET/POST /api/settings/feedback`
**Auth:** Authenticated user

GET: List user's feedback entries.
POST: Submit feedback.

| Body Field | Type | Required |
|-----------|------|----------|
| `content` | string | Yes |

### `GET /api/users/search`
**Auth:** Authenticated user

Search users by name or email.

| Query Param | Type | Description |
|------------|------|-------------|
| `q` | string | Search query |

### `PUT /api/users/[id]/admin`
**Auth:** Admin

Toggle a user's admin status.

### `GET /api/admin`
**Auth:** Admin

Admin dashboard data.

### `GET/POST /api/admin/users`
**Auth:** Admin

GET: List all users.
POST: Create a new user (dev/admin tool).

---

## Invitations

### `GET /api/invitations`
**Auth:** Admin

List all invitations.

### `POST /api/invitations`
**Auth:** Admin

Create a new invitation.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Email to invite |
| `role` | string | No | `"user"` (default) or `"admin"` |

### `GET /api/invitations/[id]`
**Auth:** None (public for accept flow)

Get invitation details by ID.

### `POST /api/invitations/[id]/accept`
**Auth:** None (public)

Accept an invitation. Used during registration flow.

---

## Goal Stacks

### `GET /api/stacks`
**Auth:** Authenticated user

List user's goal stacks (includes company stacks for admins).

### `POST /api/stacks`
**Auth:** Authenticated user

Create a new goal stack.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Stack name |
| `isCompany` | boolean | No | Company-wide stack (admin only) |
| `weekStartDay` | number | No | 0=Sunday, 1=Monday |

### `GET /api/stacks/[id]`
**Auth:** Owner or Admin

Get a goal stack with all goals.

### `PUT /api/stacks/[id]`
**Auth:** Owner or Admin

Update stack settings.

### `GET /api/stacks/[id]/export`
**Auth:** Owner or Admin

Export the goal stack as YAML.

**Response:** `{ yaml: string, version: number }`

---

## Goals

### `GET /api/goals`
**Auth:** Authenticated user

List goals with filtering.

| Query Param | Type | Description |
|------------|------|-------------|
| `stackId` | string | Filter by stack |
| `level` | GoalLevel | Filter by hierarchy level |
| `status` | GoalStatus | Filter by status |
| `parentId` | string | Filter by parent goal |

### `POST /api/goals`
**Auth:** Authenticated user

Create a new goal.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `stackId` | string | Yes | Parent stack |
| `parentId` | string | No | Parent goal ID |
| `level` | GoalLevel | Yes | HIGH_HARD, STRATEGIC, MONTHLY, WEEKLY, DAILY |
| `title` | string | Yes | Goal title |
| `description` | string | No | Goal description |
| `dueDate` | string | No | ISO date |
| `startDate` | string | No | ISO date |
| `endDate` | string | No | ISO date |

### `GET /api/goals/[id]`
**Auth:** Owner or Admin

Get a goal with children, KPIs, and assignees.

### `PATCH /api/goals/[id]`
**Auth:** Owner or Admin

Update goal fields (title, description, status, progressPct, dates, sortOrder).

### `DELETE /api/goals/[id]`
**Auth:** Owner or Admin

Soft-delete a goal (sets `deletedAt`).

### `GET /api/goals/[id]/activity`
**Auth:** Stack read access (owner, assignee, or admin)

Daily completed-task counts for a goal, used by the goal-detail activity heatmap.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `days` | number | 84 | Window size in days (clamped 1–365) |

**Response:** `{ date: string; count: number }[]` — oldest → newest, zero-filled for every day in the range.

### `POST /api/goals/import`
**Auth:** Authenticated user

Import goals from YAML.

| Body Field | Type | Required |
|-----------|------|----------|
| `stackId` | string | Yes |
| `yaml` | string | Yes |

### `POST /api/goals/[id]/link`
**Auth:** Admin

Link a company goal to an individual goal.

| Body Field | Type | Required |
|-----------|------|----------|
| `individualGoalId` | string | Yes |
| `weight` | number | No (default: 1.0) |

### `PATCH /api/goals/[id]/reorder`
**Auth:** Owner or Admin

Reorder child goals.

| Body Field | Type | Required |
|-----------|------|----------|
| `childIds` | string[] | Yes |

### `GET /api/goals/[id]/kpis`
**Auth:** Owner or Admin

List KPIs for a goal.

### `POST /api/goals/[id]/kpis`
**Auth:** Owner or Admin

Create a KPI for a goal.

| Body Field | Type | Required |
|-----------|------|----------|
| `name` | string | Yes |
| `type` | KpiType | Yes |
| `unit` | string | No |
| `targetValue` | number | No |

### `GET/PUT/DELETE /api/kpis/[id]`
**Auth:** Owner or Admin

CRUD for individual KPIs.

---

## Tasks

### `GET /api/tasks`
**Auth:** Authenticated user

List tasks with filtering. Returns tasks where user is owner OR assignee.

| Query Param | Type | Description |
|------------|------|-------------|
| `date` | string | Filter by due date (`YYYY-MM-DD`) |
| `from` / `to` | string | Date range filter |
| `status` | TaskStatus | Filter by status |
| `taskType` | TaskType | Filter by type |
| `goalId` | string | Filter by linked goal |
| `page` / `limit` | number | Pagination |

### `POST /api/tasks`
**Auth:** Authenticated user

Create a new task.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Min 3 characters |
| `taskType` | TaskType | Yes | IMPROVE, REACT, MAINTENANCE, REVIEW |
| `priority` | TaskPriority | No | LOW, MEDIUM, HIGH, URGENT |
| `dueDate` | string | No | ISO date |
| `goalId` | string | No | Linked goal |
| `processId` | string | No | Linked process |
| `description` | string | No | Task description |
| `deliverable` | string | No | Expected deliverable |
| `estimatedMinutes` | number | No | Duration estimate |
| `timeBlockStart` | string | No | ISO datetime |
| `timeBlockEnd` | string | No | ISO datetime |
| `assigneeId` | string | No | Delegate to user |
| `recurrenceRule` | string | No | RRule string |

### `GET /api/tasks/[id]`
**Auth:** Owner, Assignee, or Admin

Get task with comments, attachments, clear goals, and related data.

### `PATCH /api/tasks/[id]`
**Auth:** Owner or Admin

Update task fields. Handles Google Calendar event sync on time block changes and deletion on completion.

### `DELETE /api/tasks/[id]`
**Auth:** Owner or Admin

Delete a task and its Google Calendar event.

### `POST /api/tasks/[id]/complete-external`
**Auth:** Token-based (no session required)

Mark a task complete from an external source (Google Calendar link).

| Body Field | Type | Required |
|-----------|------|----------|
| `token` | string | Yes |

### `POST /api/tasks/batch-schedule`
**Auth:** Authenticated user

Schedule multiple tasks at once.

| Body Field | Type | Required |
|-----------|------|----------|
| `tasks` | `{ id, timeBlockStart, timeBlockEnd }[]` | Yes |

### `POST /api/tasks/ai-suggest`
**Auth:** Authenticated user

Get AI task suggestions based on goals.

### `GET/POST /api/tasks/[id]/comments`
**Auth:** Owner or Admin

GET: List comments on a task.
POST: Add a comment (with @mention parsing).

| Body Field | Type | Required |
|-----------|------|----------|
| `content` | string | Yes |

### `DELETE /api/tasks/[id]/comments/[commentId]`
**Auth:** Comment author or Admin

Delete a comment.

### `GET/POST /api/tasks/[id]/attachments`
**Auth:** Owner or Admin

GET: List attachments.
POST: Upload a file attachment.

### `GET/PUT /api/tasks/[id]/clear-goals`
**Auth:** Owner or Admin

GET: List clear goal checklist items.
PUT: Update clear goals (create/complete/delete items).

---

## AIMs (Habits)

### `GET /api/aims/categories`
**Auth:** Authenticated user

List all AIM categories (seeded defaults + custom).

### `GET /api/aims/user`
**Auth:** Authenticated user

List current user's active AIMs with category details.

### `POST /api/aims/user`
**Auth:** Authenticated user

Enroll in an AIM category or create a custom AIM.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `aimCategoryId` | string | Yes | Category to enroll in |
| `customDuration` | number | No | Override duration |
| `customFrequency` | number | No | Override frequency |
| `customActivities` | string[] | No | Custom activity list |

### `GET /api/aims/instances`
**Auth:** Authenticated user

List AIM instances for a date range.

| Query Param | Type | Description |
|------------|------|-------------|
| `from` | string | Start date (`YYYY-MM-DD`) |
| `to` | string | End date |

### `POST /api/aims/instances`
**Auth:** Authenticated user

Create an AIM instance (schedule an occurrence).

### `PATCH /api/aims/instances/[id]`
**Auth:** Authenticated user

Update an instance (complete, reschedule, add notes).

| Body Field | Type | Description |
|-----------|------|-------------|
| `status` | string | `"COMPLETED"` |
| `selectedActivity` | string | Activity performed |
| `activityNote` | string | Session notes |
| `timeBlockStart` | string | Reschedule start |
| `timeBlockEnd` | string | Reschedule end |

### `POST /api/aims/schedule`
**Auth:** Authenticated user

Batch-schedule AIM instances for upcoming days.

### `POST /api/aims/derail-batch`
**Auth:** Authenticated user

Process missed AIMs (mark as derailing).

### `GET /api/aims/history`
**Auth:** Authenticated user

AIM completion history with phase progression data.

| Query Param | Type | Description |
|------------|------|-------------|
| `aimCategoryId` | string | Filter by category |
| `days` | number | Number of days (default: 30) |

### `GET /api/aims/streak-history`
**Auth:** Authenticated user

Streak data over time for heatmap visualization.

### `GET /api/aims/unscheduled`
**Auth:** Authenticated user

AIMs that need scheduling for upcoming dates.

---

## Calendar

### `GET /api/calendar`
**Auth:** Authenticated user

Get all calendar events for a date range (internal + Google Calendar).

| Query Param | Type | Description |
|------------|------|-------------|
| `from` | string | Start date |
| `to` | string | End date |

### `POST /api/calendar`
**Auth:** Authenticated user

Create/update internal calendar events.

### `GET /api/calendar/list`
**Auth:** Authenticated user

List user's Google Calendar calendars (for selection in settings).

### `POST /api/calendar/sync`
**Auth:** Authenticated user

Force sync with Google Calendar.

### `GET /api/calendar/debug`
**Auth:** Admin only

Read-only diagnostic for duplicate Prism-managed events: lists every event matching a Prism-managed title across the caller's writable calendars with raw `extendedProperties`/`creator`/`organizer` fields, plus the caller's sync state. Data is scoped to the calling admin's own Google account. Non-admins get 403 (the calendar page's Diagnose button surfaces this in its debug panel).

---

## Reviews

### `GET /api/reviews`
**Auth:** Authenticated user

List reviews with filtering.

| Query Param | Type | Description |
|------------|------|-------------|
| `type` | ReviewType | WEEKLY, MONTHLY, YEARLY |
| `status` | string | `"pending"`, `"completed"` |
| `isTeamReview` | boolean | Team vs. personal |

### `POST /api/reviews`
**Auth:** Authenticated user

Create/schedule a review.

| Body Field | Type | Required |
|-----------|------|----------|
| `reviewType` | ReviewType | Yes |
| `scheduledDate` | string | Yes |
| `isTeamReview` | boolean | No |
| `recurrenceDayOfWeek` | number | No |
| `timeBlockStart` | string | No |
| `timeBlockEnd` | string | No |

### `GET /api/reviews/[id]`
**Auth:** Owner or Admin

Get review with answers.

### `PATCH /api/reviews/[id]`
**Auth:** Owner or Admin

Update review (complete, update notes, checklist state).

### `DELETE /api/reviews/[id]`
**Auth:** Owner or Admin

Delete a review.

### `GET /api/reviews/[id]/answers`
**Auth:** Owner or Admin

List answers for a review.

### `POST /api/reviews/[id]/answers`
**Auth:** Owner or Admin

Save a review step answer.

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `stepKey` | string | Yes | Step identifier |
| `answerType` | string | Yes | text, text_list, task_list, etc. |
| `answerData` | object | Yes | Step-specific data |

### `GET /api/reviews/unscheduled`
**Auth:** Authenticated user

Find review cadences that need scheduling.

### `GET /api/reviews/export`
**Auth:** Authenticated user

Export review data.

| Query Param | Type | Description |
|------------|------|-------------|
| `type` | ReviewType | Filter by review type |
| `from` / `to` | string | Date range |
| `format` | string | `"json"` or `"csv"` |

---

## Power Down

### `GET /api/powerdown`
**Auth:** Authenticated user

Get today's Power Down session (or most recent incomplete).

### `POST /api/powerdown`
**Auth:** Authenticated user

Create or update a Power Down session.

| Body Field | Type | Description |
|-----------|------|-------------|
| `sessionDate` | string | Date of Power Down |
| `currentStep` | number | Current wizard step (1-9) |
| `checklistState` | object | Step 1 state |
| `tomorrowPlan` | object | Steps 2-4 state |
| `clearGoals` | object | Steps 5-6 state |
| `ideas` | string[] | Step 7 captured ideas |
| `distractions` | string[] | Step 8 entries |
| `gratitudes` | string[] | Step 9 entries |
| `completedAt` | string | Completion timestamp |

### `POST /api/powerdown/decompose`
**Auth:** Authenticated user

AI-powered task decomposition for tomorrow's tasks.

| Body Field | Type | Required |
|-----------|------|----------|
| `taskId` | string | Yes |

---

## Processes

### `GET /api/processes`
**Auth:** Authenticated user

List processes grouped by business function.

### `POST /api/processes`
**Auth:** Authenticated user

Create a new process.

| Body Field | Type | Required |
|-----------|------|----------|
| `functionId` | string | Yes |
| `title` | string | Yes |
| `cadence` | ProcessCadence | Yes |
| `assigneeId` | string | No |
| `defaultDurationMinutes` | number | No |

### `GET /api/processes/[id]`
**Auth:** Authenticated user

Get process with steps and KPIs.

### `PATCH /api/processes/[id]`
**Auth:** Owner or Admin

Update process fields.

### `DELETE /api/processes/[id]`
**Auth:** Owner or Admin

Delete a process and all related data.

### `GET/PUT/DELETE /api/processes/functions/[id]`
**Auth:** Authenticated user / Admin

Manage business functions.

### `POST /api/processes/import`
**Auth:** Admin

Import process templates.

### `GET/POST /api/processes/[id]/steps`
**Auth:** Owner or Admin

List/create process steps.

### `PUT/DELETE /api/processes/[id]/steps/[stepId]`
**Auth:** Owner or Admin

Update/delete individual steps.

### `POST /api/processes/[id]/schedule`
**Auth:** Owner or Admin

Schedule a process execution (creates a maintenance task).

### `GET/POST /api/processes/[id]/kpis`
**Auth:** Owner or Admin

List/create process KPIs.

### `GET/POST /api/processes/[id]/kpis/[kpiId]/entries`
**Auth:** Authenticated user

List/create KPI data entries.

| Body Field | Type | Required |
|-----------|------|----------|
| `value` | number | Yes |
| `date` | string | Yes |
| `notes` | string | No |

---

## Ideas

### `GET /api/ideas`
**Auth:** Authenticated user

List ideas with sorting by ICE score.

### `POST /api/ideas`
**Auth:** Authenticated user

Submit a new idea.

| Body Field | Type | Required |
|-----------|------|----------|
| `title` | string | Yes |
| `description` | string | Yes |
| `impactScore` | number (1-5) | Yes |
| `confidenceScore` | number (1-5) | Yes |
| `easeScore` | number (1-5) | Yes |
| `processId` | string | No |

### `GET /api/ideas/[id]`
**Auth:** Author or Admin

Get idea details.

### `PATCH /api/ideas/[id]`
**Auth:** Author or Admin

Update idea (scores, status, description).

### `DELETE /api/ideas/[id]`
**Auth:** Author or Admin

Delete an idea.

### `POST /api/ideas/[id]/convert`
**Auth:** Author or Admin

Convert an idea into a task. Sets idea status to `CONVERTED`.

---

## Meetings

### `GET /api/meetings`
**Auth:** Authenticated user

List meetings.

### `POST /api/meetings`
**Auth:** Authenticated user

Create a meeting.

| Body Field | Type | Required |
|-----------|------|----------|
| `title` | string | Yes |
| `cadence` | ProcessCadence | Yes |
| `dayOfWeek` | number | For recurring |
| `occurDate` | string | For ONE_TIME |
| `timeStart` | string | Yes (`"HH:mm"`) |
| `timeEnd` | string | Yes (`"HH:mm"`) |
| `attendeeIds` | string[] | No |

### `GET/PUT/DELETE /api/meetings/[id]`
**Auth:** Creator or Admin

CRUD for individual meetings.

---

## Training

### `GET /api/training`
**Auth:** Authenticated user

List user's training items with progress stats.

### `POST /api/training`
**Auth:** Authenticated user

Create a training item.

| Body Field | Type | Required |
|-----------|------|----------|
| `type` | TrainingType | Yes |
| `title` | string | Yes |
| `sourceUrl` | string | No |
| `goalId` | string | No |

### `GET/PUT/DELETE /api/training/[id]`
**Auth:** Owner or Admin

CRUD for individual training items.

### `GET/POST /api/training/books`
**Auth:** Authenticated user

Book-specific management (chapters, reading tasks).

### `GET/POST /api/training/courses`
**Auth:** Authenticated user

Course-specific management (modules, progress).

### `POST /api/training/quiz/generate`
**Auth:** Authenticated user

Generate AI quiz for a training item.

| Body Field | Type | Required |
|-----------|------|----------|
| `trainingItemId` | string | Yes |
| `chapterRange` | string | No |

### `POST /api/training/quiz/check`
**Auth:** Authenticated user

Submit and score quiz answers.

| Body Field | Type | Required |
|-----------|------|----------|
| `quizAttemptId` | string | Yes |
| `answers` | object | Yes |

---

## Insights & Gamification

### `GET /api/leaderboard`
**Auth:** Authenticated user

Team leaderboard scores (streak points, task points, review points, aim points).

### `GET /api/reports`
**Auth:** Authenticated user

Analytics data for reports page.

| Query Param | Type | Description |
|------------|------|-------------|
| `tab` | string | `"reviews"`, `"tasks"`, `"aims"`, `"goals"` |
| `from` / `to` | string | Date range |

### `GET /api/streaks`
**Auth:** Authenticated user

Current user's streak data.

---

## Notifications & Logging

### `POST /api/notifications`
**Auth:** Authenticated user

Register a web push subscription.

| Body Field | Type | Required |
|-----------|------|----------|
| `endpoint` | string | Yes |
| `p256dh` | string | Yes |
| `auth` | string | Yes |

### `GET/POST /api/distractions`
**Auth:** Authenticated user

GET: List distraction logs.
POST: Log a distraction.

| Body Field | Type | Required |
|-----------|------|----------|
| `content` | string | Yes |
| `logDate` | string | Yes |
| `source` | string | No (`"manual"` or `"powerdown"`) |

---

## System

### `GET /api/health`
**Auth:** None (excluded from auth middleware)

Minimal public health check. Anonymous callers get **only**:

```json
{ "ok": true, "dbStatus": "connected" }
```

`dbStatus` is `"connected"` or `"error"` based on a cheap `SELECT 1` ping. No env details, counts, or error messages are exposed anonymously — point uptime monitors at this contract.

With `Authorization: Bearer <CRON_SECRET>` (same timing-safe check as the cron endpoints), the response is the verbose operator diagnostic: env presence flags (`dbUrlSet`, `tokenKeySet`, `googleIdSet`, `googleSecretSet`), `nextAuthUrl`, `nodeEnv`, `userCount`, `accountCount`, and `dbError` detail on failure.

---

## Cron Jobs

**Auth:** All cron endpoints require `Authorization: Bearer <CRON_SECRET>` verified via timing-safe HMAC.

### `POST /api/cron/derailing`
**Schedule:** Hourly during 18:00–23:00 UTC (GitHub Actions `derailing.yml`)

Check all users' tasks and streaks and flag derailing items. Sends notifications for at-risk items, deduped to at most once per user-local day via `Task.lastDerailNotifiedAt`.

### `POST /api/cron/meeting-reminders`
**Schedule:** Every 5 minutes (GitHub Actions `meeting-reminders.yml`)

Send push notifications shortly before scheduled meetings.

### `POST /api/cron/review-nag`
**Schedule:** Daily at 13:00 UTC (GitHub Actions `review-nag.yml`)

Send reminders for overdue reviews, deduped via `Review.lastNaggedAt`.

### `POST /api/cron/google-sync`
**Schedule:** Every 15 minutes (GitHub Actions `google-sync.yml`)

Background 2-way Google Calendar sync for all linked users.

### `POST /api/cron/streaks-recompute`
**Schedule:** None (manual/maintenance only — no scheduled workflow)

Recompute AIM streaks from history.

---

## See Also

- [DATABASE.md](DATABASE.md) — Model schemas and enum values referenced in this document
- [ARCHITECTURE.md](ARCHITECTURE.md) — Auth flow, caching strategy, API patterns
- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — How to add new API endpoints
