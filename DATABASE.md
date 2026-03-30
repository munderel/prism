# Prism — Database Schema Documentation

*Source: `prisma/schema.prisma` (40+ models, 11 enums)*

## Overview

- **Database:** PostgreSQL
- **ORM:** Prisma 7.5 with `@prisma/adapter-pg` for serverless connection pooling
- **Connection:** Max 5 connections (optimized for Vercel serverless)

### Commands

```bash
# Development — push schema directly (no migration files)
npx prisma db push

# Production — apply migration files
npx prisma migrate deploy

# Seed default data (AIM categories, review templates)
npx prisma db seed

# Generate Prisma client after schema changes
npx prisma generate
```

---

## Entity-Relationship Summary

```
User (central)
 ├── GoalStack[] ──→ Goal[] (self-referencing hierarchy)
 │                     ├── Kpi[]
 │                     ├── GoalLink[] (company ↔ individual)
 │                     ├── GoalAssignee[]
 │                     └── Task[]
 │                          ├── ClearGoal[]
 │                          ├── TaskComment[] ──→ CommentMention[]
 │                          ├── TaskAttachment[]
 │                          └── ProcessExecution?
 ├── UserAim[] ──→ AimCategory
 │                  └── AimInstance[]
 ├── Review[] ──→ ReviewAnswer[]
 ├── PowerdownSession[]
 ├── Streak[]
 ├── PublicWin[]
 ├── Idea[] ──→ IdeaAttachment[]
 ├── Meeting[]
 ├── DistractionLog[]
 ├── TrainingItem[] ──→ TrainingTask[] ──→ QuizAttempt[]
 ├── Invitation[]
 ├── NotificationPreference?
 ├── PushSubscription[]
 └── Feedback[]

BusinessFunction[]
 └── Process[]
      ├── ProcessStep[]
      ├── ProcessExecution[]
      └── ProcessKpi[]
           ├── ProcessKpiEntry[]
           └── ProcessKpiGoal[]

CompanySettings (singleton)
CompanyAuthSettings (singleton)
ReviewTemplate[] (seeded per review type)
ConfigVersion[] (YAML goal stack versioning)
```

---

## Enums

### GoalLevel
| Value | Description |
|-------|-------------|
| `HIGH_HARD` | Ultimate long-term ambition (10+ years) |
| `STRATEGIC` | 5-10 year milestone |
| `MONTHLY` | This month's target |
| `WEEKLY` | This week's deliverables |
| `DAILY` | Today's actions |

### GoalStatus
| Value | Description |
|-------|-------------|
| `NOT_STARTED` | Goal not yet begun |
| `IN_PROGRESS` | Actively being worked on |
| `COMPLETED` | Successfully achieved |
| `ABANDONED` | Intentionally dropped |

### TaskType
| Value | DB Value | Description |
|-------|----------|-------------|
| `IMPROVE` | `GOAL_STACK` | Proactive goal-related work |
| `REACT` | `REACT` | Unplanned/reactive work |
| `MAINTENANCE` | `MAINTENANCE` | Routine operational work |
| `REVIEW` | `REVIEW` | Review ritual tasks |

> **Note:** `IMPROVE` maps to `GOAL_STACK` in the database via Prisma's `@map`. Code uses `IMPROVE`, DB stores `GOAL_STACK`.

### TaskStatus
`TODO` | `IN_PROGRESS` | `DONE` | `DROPPED`

### TaskPriority
`LOW` | `MEDIUM` | `HIGH` | `URGENT`

### ReviewType
`WEEKLY` | `MONTHLY` | `YEARLY`

### InvitationStatus
`PENDING` | `ACCEPTED` | `REVOKED`

### IdeaStatus
`SUBMITTED` | `UNDER_REVIEW` | `APPROVED` | `REJECTED` | `CONVERTED` | `ARCHIVED`

### ProcessCadence
`ONE_TIME` | `DAILY` | `WEEKLY` | `BIWEEKLY` | `MONTHLY` | `QUARTERLY` | `YEARLY`

### KpiType
`NUMERIC` | `BINARY`

### KpiTimeLevel
`WEEKLY` | `MONTHLY` | `YEARLY` | `FIVE_YEAR` | `HHG`

### TrainingType
`BOOK` | `COURSE`

---

## Models by Domain

### Authentication & Users

#### User
The central entity. Every other model relates back to User.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `email` | String (unique) | Login email |
| `name` | String? | Display name |
| `image` | String? | Avatar URL |
| `emailVerified` | DateTime? | Email verification timestamp |
| `passwordHash` | String? | Bcrypt hash (null for OAuth-only users) |
| `totpSecret` | String? | TOTP secret for 2FA |
| `is2FAEnabled` | Boolean | Whether 2FA is active |
| `isLockedOut` | Boolean | Account lockout flag |
| `isAdmin` | Boolean | Admin role flag |
| `hasCompletedOnboarding` | Boolean | Onboarding wizard completed |
| `mtp` | String? | Massive Transformative Purpose |
| `timezone` | String | IANA timezone (default: `America/New_York`) |
| `hiddenFeatures` | Json | `string[]` of hidden sidebar feature IDs |
| `workingHoursStart` | String? | `HH:mm` format (e.g., `"09:00"`) |
| `workingHoursEnd` | String? | `HH:mm` format |
| `casualHoursStart` | String? | `HH:mm` format |
| `casualHoursEnd` | String? | `HH:mm` format |
| `powerdownTime` | String? | `HH:mm` format for evening ritual |
| `taskSchedulePeriod` | String? | `"working"` \| `"casual"` \| `"both"` |
| `selectedCalendarIds` | Json | `string[]` of Google Calendar IDs to sync |
| `googleRefreshToken` | String? | Encrypted Google OAuth refresh token |
| `googleTokenExpiresAt` | DateTime? | Token expiry |

#### Account
NextAuth OAuth account linking. Stores provider tokens for Google OAuth.

#### Session
NextAuth session model. Kept for adapter compatibility, but **unused** — Prism uses JWT strategy (sessions stored in tokens, not DB).

#### VerificationToken
NextAuth email verification tokens.

#### Invitation
Invite-only user registration.

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | Invited email address |
| `role` | String | `"user"` or `"admin"` |
| `status` | InvitationStatus | PENDING / ACCEPTED / REVOKED |
| `invitedById` | String | Admin who created the invite |

Indexes: `email`, `status`

#### CompanySettings
Singleton for company-wide configuration.

| Field | Type | Description |
|-------|------|-------------|
| `companyMtp` | String? | Company-level Massive Transformative Purpose |

#### CompanyAuthSettings
Singleton for authentication policies.

| Field | Type | Description |
|-------|------|-------------|
| `enforce2FA` | Boolean | Require all users to set up 2FA |

#### NotificationPreference
One-to-one with User. Controls notification channels.

| Field | Type | Default |
|-------|------|---------|
| `emailEnabled` | Boolean | `true` |
| `pushEnabled` | Boolean | `true` |
| `derailingAlerts` | Boolean | `true` |
| `mentionAlerts` | Boolean | `true` |
| `reviewNags` | Boolean | `true` |

#### PushSubscription
Web Push subscription endpoints per user. Fields: `endpoint`, `p256dh`, `auth`.

---

### Goal Hierarchy

#### GoalStack
Container for a user's goal hierarchy. Supports multiple stacks (personal, company).

| Field | Type | Description |
|-------|------|-------------|
| `ownerId` | String | Stack owner |
| `name` | String | Stack display name (e.g., "Personal Stack") |
| `isCompany` | Boolean | Company-wide stack (admin-only edit) |
| `visibility` | String | `"private"` \| `"group"` \| `"company"` |
| `weekStartDay` | Int | 0 = Sunday, 1 = Monday, ... 6 = Saturday |

Index: `ownerId`

#### Goal
Self-referencing hierarchy via `parentId`. Supports soft delete via `deletedAt`.

| Field | Type | Description |
|-------|------|-------------|
| `stackId` | String | Parent GoalStack |
| `parentId` | String? | Parent Goal (null = root level) |
| `level` | GoalLevel | Hierarchy level |
| `title` | String | Goal title |
| `description` | String? | Goal description |
| `status` | GoalStatus | Current status |
| `progressPct` | Float | 0-100 progress percentage |
| `dueDate` | DateTime? | Target completion date |
| `startDate` | DateTime? | Goal start date |
| `endDate` | DateTime? | Goal end date |
| `sortOrder` | Int | Display order among siblings |
| `deletedAt` | DateTime? | Soft delete timestamp |

Indexes: `stackId`, `parentId`, `deletedAt`

> **Important:** All Goal queries must filter `deletedAt: null` to exclude soft-deleted goals.

#### GoalLink
Links company goals to individual goals with a weight multiplier.

| Field | Type | Description |
|-------|------|-------------|
| `companyGoalId` | String | Company-level goal |
| `individualGoalId` | String | Individual-level goal |
| `weight` | Float | Weight multiplier (default: 1.0) |

#### GoalAssignee
Many-to-many assignment of users to goals.

Unique constraint: `[goalId, userId]`

#### Kpi
Key Performance Indicators attached to goals.

| Field | Type | Description |
|-------|------|-------------|
| `goalId` | String | Parent goal |
| `name` | String | KPI name |
| `type` | KpiType | NUMERIC or BINARY |
| `unit` | String? | Measurement unit (e.g., "locations", "revenue") |
| `targetValue` | Float? | Target number |
| `actualValue` | Float? | Current actual |
| `isComplete` | Boolean | Whether KPI target is met |
| `linkedKpiId` | String? | Self-referencing link to related KPI |

Unique constraint: `[goalId, name]`

---

### Tasks & Tracking

#### Task
The central work unit. Links to Goal, Process, AimInstance, and User (owner + assignee).

| Field | Type | Description |
|-------|------|-------------|
| `ownerId` | String | Task creator |
| `assigneeId` | String? | Delegated to user |
| `goalId` | String? | Linked goal |
| `processId` | String? | Linked process |
| `aimInstanceId` | String? | Linked AIM instance (for deep work) |
| `taskType` | TaskType | IMPROVE, REACT, MAINTENANCE, REVIEW |
| `title` | String | Task title (min 3 chars) |
| `description` | String? | Task description |
| `deliverable` | String? | Expected deliverable |
| `status` | TaskStatus | TODO, IN_PROGRESS, DONE, DROPPED |
| `priority` | TaskPriority | LOW, MEDIUM, HIGH, URGENT |
| `dueDate` | DateTime? | Due date |
| `recurrenceRule` | String? | RRule string for recurring tasks |
| `calendarEventId` | String? | Google Calendar event ID |
| `timeBlockStart` | DateTime? | Calendar time block start |
| `timeBlockEnd` | DateTime? | Calendar time block end |
| `estimatedMinutes` | Int | Estimated duration (default: 60) |
| `preferredTimeStart` | String? | Preferred scheduling window start |
| `preferredTimeEnd` | String? | Preferred scheduling window end |
| `isPinned` | Boolean | Pinned to top |
| `isAutoScheduled` | Boolean | Auto-scheduled by engine |
| `isWinTheDay` | Boolean | Selected as Win the Day task |
| `startedAt` | DateTime? | When work started |
| `completedAt` | DateTime? | When marked done |
| `failedAt` | DateTime? | When marked failed |
| `rescheduledTo` | DateTime? | Rescheduled date |

Indexes: `ownerId`, `dueDate`, `status`, `goalId`, `[ownerId, dueDate]`, `[ownerId, status]`, `assigneeId`

#### ClearGoal
Sub-checklist items for tasks, created during Power Down.

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | String | Parent task |
| `text` | String | Checklist item text |
| `isComplete` | Boolean | Completion status |
| `sortOrder` | Int | Display order |
| `createdInPowerdownId` | String? | Power Down session that created this |

Index: `taskId`

#### TaskComment
Comments on tasks with @mention support.

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | String | Parent task |
| `authorId` | String | Comment author |
| `content` | String | Comment text (may contain @mentions) |

#### CommentMention
Parsed @mentions from task comments. Triggers notifications.

#### TaskAttachment
File attachments on tasks. Fields: `fileName`, `fileUrl`, `fileSize`, `mimeType`.

#### Streak
Cumulative engagement streaks per user per type.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | User |
| `streakType` | String | Streak category identifier |
| `currentCount` | Int | Current consecutive count |
| `bestCount` | Int | All-time best |
| `lastActiveDate` | DateTime? | Last activity date |

Unique constraint: `[userId, streakType]`

#### PublicWin
Shareable task/goal completions for the leaderboard.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | User who achieved the win |
| `goalId` | String? | Related goal |
| `taskId` | String? | Related task |
| `message` | String | Win description |

---

### Reviews & Rituals

#### Review
Scheduled review sessions (weekly, monthly, yearly).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | Review owner |
| `reviewType` | ReviewType | WEEKLY, MONTHLY, YEARLY |
| `scheduledDate` | DateTime | When the review is due |
| `completedAt` | DateTime? | Completion timestamp |
| `notes` | String? | General notes |
| `checklistState` | Json? | Wizard step progress state |
| `startDate` | DateTime? | Period start date |
| `recurrenceDayOfWeek` | Int? | Day of week for cadence (0=Sun) |
| `isTeamReview` | Boolean | Team review vs. personal |
| `timeBlockStart` | DateTime? | Calendar time block |
| `timeBlockEnd` | DateTime? | Calendar time block |
| `calendarEventId` | String? | Google Calendar event ID |

Indexes: `[userId, reviewType]`, `scheduledDate`

#### ReviewTemplate
Seeded templates defining wizard structure per review type.

| Field | Type | Description |
|-------|------|-------------|
| `reviewType` | ReviewType | Template review type |
| `checklistItems` | Json | Step definitions |
| `processSteps` | Json | Process step definitions |
| `isTeamTemplate` | Boolean | Team vs. personal template |

Unique constraint: `[reviewType, isTeamTemplate]`

#### ReviewAnswer
Flexible storage for review wizard step responses.

| Field | Type | Description |
|-------|------|-------------|
| `reviewId` | String | Parent review |
| `stepKey` | String | Step identifier (e.g., `"step_3_kpi_progress"`) |
| `answerType` | String | `"text"` \| `"text_list"` \| `"task_list"` \| `"goal_list"` \| `"priority_ranking"` \| `"kpi_progress"` |
| `answerData` | Json | Step-specific response data |

Index: `reviewId`

#### PowerdownSession
Evening shutdown ritual state (9 steps).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | Session owner |
| `sessionDate` | DateTime | Date of the Power Down |
| `currentStep` | Int | Current wizard step (1-9) |
| `checklistState` | Json? | Step 1: today's review checklist |
| `tomorrowPlan` | Json? | Step 2-4: tomorrow's tasks and calendar |
| `distractions` | Json? | Step 8: distraction log entries |
| `gratitudes` | Json? | Step 9: gratitude entries |
| `ideas` | Json? | Step 7: captured ideas |
| `clearGoals` | Json? | Step 5-6: clear goal checklists |
| `completedAt` | DateTime? | Completion timestamp |

Index: `[userId, sessionDate]`

#### DistractionLog
Distraction entries from Power Down or manual logging.

| Field | Type | Description |
|-------|------|-------------|
| `content` | String | Distraction description |
| `notes` | String? | Additional context |
| `logDate` | DateTime | Date of distraction |
| `source` | String | `"powerdown"` \| `"manual"` |

Index: `[userId, logDate]`

---

### AIMs (Habits)

#### AimCategory
Shared habit definitions. Seeded with defaults (Deep Work, Exercise, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Category name (e.g., "Deep Work") |
| `description` | String? | Category description |
| `defaultFrequency` | Int | Default times per week |
| `defaultDurationMin` | Int | Default duration in minutes |
| `isGroupable` | Boolean | Can be done socially |
| `isDefault` | Boolean | Seeded default category |
| `isDaily` | Boolean | Daily vs. weekly frequency |
| `activities` | Json? | Activity options (e.g., `["strength", "cardio", "yoga"]`) |
| `schedulePeriod` | String | `"working"` \| `"casual"` \| `"both"` |

#### UserAim
User's enrollment in an AIM category with custom overrides.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | User |
| `aimCategoryId` | String | AIM category |
| `isActive` | Boolean | Currently active |
| `customDuration` | Int? | Override default duration |
| `customFrequency` | Int? | Override default frequency |
| `customActivities` | Json? | Override activity list |
| `customSchedulePeriod` | String? | Override schedule period |
| `currentPhase` | String | `"SEED"` \| `"SPROUT"` \| `"GROW"` \| `"FLOW"` |
| `phaseStartedAt` | DateTime | When current phase began |
| `completionCount` | Int | Total completions |
| `currentStreak` | Int | Current consecutive streak |
| `bestStreak` | Int | All-time best streak |
| `lastCompletedAt` | DateTime? | Last completion timestamp |
| `derailSensitivityDays` | Int | Missed days before "derailing" alert (default: 1) |
| `reminderTimeMinutes` | Int? | Minutes before end of day to remind |

Unique constraint: `[userId, aimCategoryId]`

#### AimInstance
Individual scheduled/completed instances of an AIM.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | User |
| `aimCategoryId` | String | AIM category |
| `scheduledDate` | DateTime | Date scheduled for |
| `timeBlockStart` | DateTime? | Calendar time block |
| `timeBlockEnd` | DateTime? | Calendar time block |
| `isGroupOpen` | Boolean | Open for others to join |
| `status` | String | `"SCHEDULED"` \| `"COMPLETED"` |
| `completedAt` | DateTime? | Completion timestamp |
| `activityNote` | String? | Notes about the session |
| `selectedActivity` | String? | Chosen activity (e.g., `"strength"`) |
| `phaseAtCompletion` | String? | Phase snapshot when completed |
| `pointsEarned` | Int | Points for leaderboard |

Index: `[userId, scheduledDate]`

---

### Processes & KPIs

#### BusinessFunction
Top-level business area container.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Function name (e.g., "Marketing", "Sales") |
| `description` | String? | Function description |
| `sortOrder` | Int | Display order |

#### Process
Repeatable workflow within a business function.

| Field | Type | Description |
|-------|------|-------------|
| `functionId` | String | Parent BusinessFunction |
| `title` | String | Process name |
| `assigneeId` | String? | Primary owner |
| `delegateId` | String? | Delegated to user |
| `delegateUntil` | DateTime? | Delegation expiry |
| `cadence` | ProcessCadence | Execution frequency |
| `cadenceRule` | String? | Custom recurrence rule |
| `defaultDurationMinutes` | Int | Estimated duration (default: 60) |
| `lastRunAt` | DateTime? | Last execution time |
| `nextDueAt` | DateTime? | Next scheduled execution |

Indexes: `functionId`, `assigneeId`, `nextDueAt`

#### ProcessStep
Individual steps within a process.

| Field | Type | Description |
|-------|------|-------------|
| `processId` | String | Parent Process |
| `title` | String | Step title |
| `description` | String? | Step instructions |
| `url` | String? | Reference URL |
| `sortOrder` | Int | Step order |

#### ProcessExecution
Execution records. One-to-one with Task via `taskId`.

| Field | Type | Description |
|-------|------|-------------|
| `processId` | String | Executed process |
| `executedById` | String? | Who executed it |
| `scheduledDate` | DateTime | Scheduled execution date |
| `completedAt` | DateTime? | Completion timestamp |
| `taskId` | String? (unique) | Linked maintenance task |

#### ProcessKpi
KPI definitions attached to processes.

| Field | Type | Description |
|-------|------|-------------|
| `processId` | String | Parent process |
| `name` | String | KPI name |
| `unit` | String? | Measurement unit |
| `targetValue` | Float? | Default target |
| `goalId` | String? | Optional link to Goal Stack goal |

#### ProcessKpiEntry
Time-series KPI data points.

| Field | Type | Description |
|-------|------|-------------|
| `kpiId` | String | Parent ProcessKpi |
| `userId` | String | Who logged the entry |
| `value` | Float | Actual value |
| `date` | DateTime | Entry date |
| `notes` | String? | Notes |

Index: `[kpiId, date]`

#### ProcessKpiGoal
Targets at each time level (independently set by users, not auto-calculated).

| Field | Type | Description |
|-------|------|-------------|
| `kpiId` | String | Parent ProcessKpi |
| `timeLevel` | KpiTimeLevel | WEEKLY, MONTHLY, YEARLY, FIVE_YEAR, HHG |
| `targetValue` | Float | Target value for this time level |

Unique constraint: `[kpiId, timeLevel]`

---

### Ideas & Training

#### Idea
Idea capture with ICE scoring and status workflow.

| Field | Type | Description |
|-------|------|-------------|
| `authorId` | String | Idea author |
| `title` | String | Idea title |
| `description` | String | Idea description |
| `processId` | String? | Related process |
| `impactScore` | Int | Impact (1-5) |
| `confidenceScore` | Int | Confidence (1-5) |
| `easeScore` | Int | Ease (1-5) |
| `iceScore` | Float? | Computed ICE score |
| `status` | IdeaStatus | Status workflow |
| `taskId` | String? (unique) | Converted task |

Indexes: `authorId`, `status`, `iceScore`

#### IdeaAttachment / TaskAttachment
File attachments. Fields: `fileName`, `fileUrl`, `fileSize`, `mimeType`.

#### TrainingItem
Books or courses being tracked.

| Field | Type | Description |
|-------|------|-------------|
| `ownerId` | String | User |
| `type` | TrainingType | BOOK or COURSE |
| `title` | String | Item title |
| `sourceUrl` | String? | External link |
| `uploadedFileUrl` | String? | Uploaded file |
| `aiMetadata` | Json? | AI-extracted metadata |
| `targetCompletionDate` | DateTime? | Target date |
| `goalId` | String? | Linked goal |
| `status` | String | `"ACTIVE"` \| `"COMPLETED"` \| `"ARCHIVED"` |

#### TrainingTask
Links a TrainingItem to a Task (one-to-one via `taskId`).

| Field | Type | Description |
|-------|------|-------------|
| `trainingItemId` | String | Parent TrainingItem |
| `taskId` | String (unique) | Linked task |
| `chapterRange` | String? | Book chapter range |
| `moduleIndex` | Int? | Course module index |
| `isQuizDay` | Boolean | Whether this task includes a quiz |

#### QuizAttempt
AI-generated quiz attempts.

| Field | Type | Description |
|-------|------|-------------|
| `trainingItemId` | String | Parent TrainingItem |
| `questions` | Json | Generated questions |
| `userAnswers` | Json? | User's answers |
| `score` | Float? | Quiz score |
| `llmFeedback` | Json? | AI feedback per answer |

---

### Other Models

#### Meeting
Recurring or one-time meetings.

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Meeting title |
| `cadence` | ProcessCadence | ONE_TIME, DAILY, WEEKLY, etc. |
| `dayOfWeek` | Int? | 0=Sun, 1=Mon, ... 6=Sat |
| `occurDate` | DateTime? | Specific date (ONE_TIME only) |
| `timeStart` | String | `"HH:mm"` format |
| `timeEnd` | String | `"HH:mm"` format |
| `attendeeIds` | Json | `string[]` of user IDs |

#### ConfigVersion
YAML goal stack versioning for import/export history.

| Field | Type | Description |
|-------|------|-------------|
| `stackId` | String | Parent GoalStack |
| `versionNum` | Int | Sequential version number |
| `yamlContent` | String | Full YAML content |
| `changeSummary` | String? | Description of changes |

#### Feedback
User feedback entries (submitted via Settings).

---

## Key Indexes

| Model | Index | Purpose |
|-------|-------|---------|
| Task | `[ownerId, dueDate]` | Dashboard daily/weekly task queries |
| Task | `[ownerId, status]` | Filtered task lists |
| Task | `assigneeId` | Delegated task queries |
| Goal | `deletedAt` | Soft delete filtering |
| AimInstance | `[userId, scheduledDate]` | Daily AIM schedule |
| ProcessKpiEntry | `[kpiId, date]` | Time-series KPI queries |
| Review | `[userId, reviewType]` | Review listing by type |
| Invitation | `[email]`, `[status]` | Invitation lookup |

---

## JSON Field Schemas

| Model.Field | Shape | Example |
|-------------|-------|---------|
| `User.hiddenFeatures` | `string[]` | `["training", "ideas", "leaderboard"]` |
| `User.selectedCalendarIds` | `string[]` | `["primary", "abc123@group.calendar.google.com"]` |
| `AimCategory.activities` | `string[]` | `["strength", "cardio", "yoga", "running"]` |
| `Meeting.attendeeIds` | `string[]` | `["clx123", "clx456"]` |
| `ReviewAnswer.answerData` | Varies by `answerType` | See below |
| `PowerdownSession.checklistState` | Wizard step state | `{ completedSteps: [1, 2], ...}` |
| `PowerdownSession.distractions` | `string[]` | `["Checked social media", "Phone call"]` |
| `PowerdownSession.gratitudes` | `string[]` | `["Great team meeting", "Closed a deal"]` |
| `ReviewTemplate.checklistItems` | Step definition array | `[{ label: "...", required: true }]` |

### ReviewAnswer.answerData by answerType

| answerType | Shape |
|-----------|-------|
| `text` | `{ value: string }` |
| `text_list` | `{ items: string[] }` |
| `task_list` | `{ taskIds: string[] }` |
| `goal_list` | `{ goalIds: string[] }` |
| `priority_ranking` | `{ ranked: [{ taskId, rank }] }` |
| `kpi_progress` | `{ entries: [{ kpiId, actual, notes }] }` |

---

## Seeding

Running `npx prisma db seed` creates:

1. **ReviewTemplates** — One template per review type (WEEKLY, MONTHLY, YEARLY) for both personal and team reviews
2. **AimCategories** — Default habit categories (Deep Work, Exercise, Active Recovery, Flow Activity, etc.) with recommended frequencies and durations

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — How the data layer fits into the overall system
- [API-REFERENCE.md](API-REFERENCE.md) — API endpoints that read/write these models
- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — How to modify the schema and add new models
- [prisma/schema.prisma](prisma/schema.prisma) — Raw source of truth
