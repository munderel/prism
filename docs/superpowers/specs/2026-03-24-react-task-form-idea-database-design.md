# Reactive Task Form & Idea Database — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

Creating reactive tasks currently uses the generic TaskEditor modal, which doesn't guide users through describing the issue properly. There's no structured framework for communicating context, prior attempts, the specific request, or urgency. There's also no way to submit ideas for future work or to browse a backlog of ideas with scoring.

## Solution Overview

Two new dedicated form pages:

1. **Create Reactive Task** (`/tasks/new-react`) — A guided form using the CARS framework (Context, Attempts, Request, Stakes) that links to the responsible person via their Process/area of responsibility, assigns the task to them, and sets a deadline with team-wide guidelines.

2. **Create Idea / Idea Database** (`/ideas`) — A submission form using the PICS framework (Problem, Idea, Cost, Stakes) with ICE scoring (Impact, Confidence, Ease), optional process linking, and a browsable idea database.

Both forms support file attachments.

## Data Models

### Idea (New Model)

```prisma
model Idea {
  id              String    @id @default(cuid())
  authorId        String
  title           String
  description     String    @db.Text   // PICS-formatted description
  processId       String?              // linked process if relevant
  confidenceScore Int                  // 1-5: likelihood of expected result
  easeScore       Int                  // 1-5: how easy to execute (1=HARD, 5=EASY)
  impactScore     Int                  // 1-5: how impactful (1=LOW, 5=HIGH)
  iceScore        Float?               // computed: (impact * confidence * ease) / 3
  status          IdeaStatus @default(SUBMITTED)
  taskId          String?    @unique   // if idea is converted to a task
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  author      User              @relation(fields: [authorId], references: [id], onDelete: Cascade)
  process     Process?          @relation(fields: [processId], references: [id])
  task        Task?             @relation(fields: [taskId], references: [id])
  attachments IdeaAttachment[]

  @@index([authorId])
  @@index([status])
  @@index([iceScore])
}

enum IdeaStatus {
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  CONVERTED    // converted to a task
  ARCHIVED
}
```

### IdeaAttachment (New Model)

```prisma
model IdeaAttachment {
  id        String   @id @default(cuid())
  ideaId    String
  fileName  String
  fileUrl   String
  fileSize  Int
  mimeType  String
  createdAt DateTime @default(now())

  idea Idea @relation(fields: [ideaId], references: [id], onDelete: Cascade)

  @@index([ideaId])
}
```

### TaskAttachment (New Model)

```prisma
model TaskAttachment {
  id        String   @id @default(cuid())
  taskId    String
  fileName  String
  fileUrl   String
  fileSize  Int
  mimeType  String
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
}
```

### Model Additions

Add to `Idea` model: `attachments IdeaAttachment[]`

Add to `Task` model: `attachments TaskAttachment[]`

Add to `User` model: `ideas Idea[]`

Add to `Process` model: `ideas Idea[]`

### Task Model — New Fields

```prisma
model Task {
  // ... existing fields ...
  processId    String?              // NEW: links reactive task to related process
  attachments  TaskAttachment[]     // NEW: file attachments

  process      Process? @relation("TaskProcess", fields: [processId], references: [id])
}
```

Add reverse relation to Process: `tasks Task[] @relation("TaskProcess")`

**Note:** This is a direct FK from Task → Process for informational linking (which process area is this about?). This is separate from the existing `ProcessExecution` mechanism which tracks process execution instances. A REACT task linked to a process via `processId` does NOT create a ProcessExecution record.

### Task Model — CARS Fields

The REACT task's CARS content goes into the existing `description` field as structured text. The form UI structures the input, and the API stores the combined CARS text in `description`.

Format stored in description:
```
**Context:** {user input}
**Attempts:** {user input}
**Request:** {user input}
**Stakes:** {user input}
```

## Page 1: Create Reactive Task (`/tasks/new-react`)

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Create a Reactive Task                              │
│  Use this form to create a Reactive Task for our     │
│  team.                                               │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 📌 Please use CARS to describe the Reactive     │ │
│  │    Task accurately.                             │ │
│  │                                                 │ │
│  │ ▶ Click the Triangle to Review CARS ℹ️          │ │
│  │  ┌───────────────────────────────────────────┐  │ │
│  │  │ C - Context: What relevant info should    │  │ │
│  │  │     others know about this?               │  │ │
│  │  │ A - Attempts: What have you tried already │  │ │
│  │  │     to solve this problem?                │  │ │
│  │  │ R - Request: What specific actions would  │  │ │
│  │  │     you like to see happen?               │  │ │
│  │  │ S - Stakes: What makes this task          │  │ │
│  │  │     important to complete by this person  │  │ │
│  │  │     in this time frame?                   │  │ │
│  │  └───────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  What action are you requesting? *                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │ e.g., "Publish Case Study #212"                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Who is responsible for this area? *                 │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🔍 Search processes...                          │ │
│  │  ┌───────────────────────────────────────────┐  │ │
│  │  │ Marketing > Social Media — Alex Johnson   │  │ │
│  │  │ Engineering > Website — Sam Chen          │  │ │
│  │  │ Sales > Lead Qualification — Jordan Lee   │  │ │
│  │  └───────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Please describe using CARS: *                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Context:                                        │ │
│  │ ____________________________________________    │ │
│  │ Attempts:                                       │ │
│  │ ____________________________________________    │ │
│  │ Request:                                        │ │
│  │ ____________________________________________    │ │
│  │ Stakes:                                         │ │
│  │ ____________________________________________    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 📌 Deadline Guidelines                          │ │
│  │ ▶ Click for Guidelines on Deadlines ℹ️          │ │
│  │  < 24 Hours: Extremely rare, fully blocking     │ │
│  │  1-3 Days: Quick requests or partially blocked  │ │
│  │  3-14 Days: General issues, not core function   │ │
│  │  > 14 Days: Consider submitting as an Idea      │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  What is the deadline? *                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │ [Date Picker]                                   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Attachments (optional)                              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Drop files here or click to upload              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [ Create Reactive Task ]                            │
└──────────────────────────────────────────────────────┘
```

### Process/Responsibility Search

The "Who is responsible?" field is a searchable dropdown that:

1. Fetches all BusinessFunctions + Processes with their assignees via `GET /api/processes`
2. Displays as: `{BusinessFunction} > {Process Title} — {Assignee Name}`
3. User types to search/filter by function name, process title, or assignee name
4. Selecting a process auto-fills:
   - `assignee` → task owner (the person responsible)
   - `processId` → links task to the related process (stored as metadata)
5. If no process matches, user can manually select any team member

### Form Submission

`POST /api/tasks` with:
```json
{
  "title": "Publish Case Study #212",
  "description": "**Context:** ...\n**Attempts:** ...\n**Request:** ...\n**Stakes:** ...",
  "taskType": "REACT",
  "priority": "HIGH",
  "dueDate": "2026-03-27T00:00:00Z",
  "estimatedMinutes": 60,
  "ownerId": "{assignee from selected process}",
  "processId": "{optional, if process selected}"
}
```

**Priority:** Defaults to HIGH (reactive tasks are interrupts by nature) but the form includes an optional priority selector so the user can downgrade to MEDIUM or upgrade to URGENT if appropriate. The form shows the deadline guidelines which help calibrate: < 24h → URGENT, 1-3 days → HIGH, 3-14 days → MEDIUM.

**Estimated duration:** Defaults to 60 minutes. Shown as a duration picker on the form (same presets as TaskEditor) so the creator can adjust.

After creation, upload attachments via `POST /api/tasks/{id}/attachments`.

### Auto-Assign Logic

- If a process is selected and has an `assigneeId` → task assigned to that person
- If process has a `delegateId` with valid `delegateUntil` → task assigned to delegate instead
- Delegation check: `delegateUntil >= today ? delegateId : assigneeId`
- If no process selected → user must manually pick an assignee from team member list

## Page 2: Create Idea (`/ideas/new`)

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Create an Idea                                      │
│  Use this form to inspire where we should invest     │
│  our time in the future.                             │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ You might find the PICS framework helpful.      │ │
│  │ ▶ Click to Review PICS ℹ️                       │ │
│  │  P - Problem: Here's the opportunity I see      │ │
│  │  I - Idea: Here's how I'd solve it              │ │
│  │  C - Cost: Investment needed (time/money/energy)│ │
│  │  S - Stakes: Why prioritize this over others    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  What should we call this Idea? *                    │
│  ┌─────────────────────────────────────────────────┐ │
│  │ e.g., "Adopt a company dog"                     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Describe using PICS: *                              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Problem:                                        │ │
│  │ ____________________________________________    │ │
│  │ Idea:                                           │ │
│  │ ____________________________________________    │ │
│  │ Cost:                                           │ │
│  │ ____________________________________________    │ │
│  │ Stakes:                                         │ │
│  │ ____________________________________________    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Related Process (optional)                          │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🔍 Search processes...                          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Confidence: How likely to produce expected result?* │
│  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]                     │
│                                                      │
│  Ease: How easy to execute? (1=HARD, 5=EASY) *      │
│  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]                     │
│                                                      │
│  Impact: How impactful? (1=LOW, 5=HIGH) *            │
│  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]                     │
│                                                      │
│  Attachments (optional)                              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Drop files here or click to upload              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [ Submit Your Idea ]                                │
└──────────────────────────────────────────────────────┘
```

### Form Submission

`POST /api/ideas` with:
```json
{
  "title": "Adopt a company dog",
  "description": "**Problem:** ...\n**Idea:** ...\n**Cost:** ...\n**Stakes:** ...",
  "processId": "optional-process-id",
  "confidenceScore": 4,
  "easeScore": 3,
  "impactScore": 5
}
```

Server computes `iceScore = (impact * confidence * ease) / 3` and stores it. This uses a multiplicative formula (range 0.33–41.67) rather than the additive `(I+C+E)/3` average (range 1–5). The multiplicative approach amplifies differences — a task scoring 5/5/5 gets 41.67 while 3/3/3 gets 9.0, creating clearer separation for prioritization.

After creation, upload attachments via `POST /api/ideas/{id}/attachments`.

## Page 3: Idea Database (`/ideas`)

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Idea Database                          [+ New Idea] │
│                                                      │
│  ┌──────────────┐ ┌────────────┐ ┌────────────────┐ │
│  │ Filter Status │ │ Sort by    │ │ 🔍 Search...   │ │
│  │ [All ▾]      │ │ [ICE ▾]    │ │                │ │
│  └──────────────┘ └────────────┘ └────────────────┘ │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ ⭐ Adopt a company dog           ICE: 20.0      ││
│  │ Status: SUBMITTED  · By: Alex  · Mar 20         ││
│  │ Impact: 5  Confidence: 4  Ease: 3               ││
│  │ Process: Office Management                       ││
│  │ [Review] [Convert to Task] [Archive]             ││
│  ├──────────────────────────────────────────────────┤│
│  │ 💡 Automate weekly reports         ICE: 15.0    ││
│  │ Status: APPROVED  · By: Sam  · Mar 18           ││
│  │ Impact: 5  Confidence: 3  Ease: 3               ││
│  │ Process: Reporting > Monthly Reports             ││
│  │ [Convert to Task] [Archive]                      ││
│  ├──────────────────────────────────────────────────┤│
│  │ 🔄 Redesign onboarding flow       ICE: 8.3     ││
│  │ Status: UNDER_REVIEW  · By: Jordan  · Mar 15    ││
│  │ ...                                              ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Features

- **Sort by:** ICE score (default, descending), date created, status, impact, confidence, ease
- **Filter by:** Status (All, Submitted, Under Review, Approved, Rejected, Converted, Archived)
- **Search:** Title and description full-text search
- **Pagination:** 20 ideas per page with load-more or page navigation
- **Click to expand:** Shows full PICS description, attachments, and linked process details

### Idea Actions

| Action | Who Can | What Happens |
|--------|---------|-------------|
| Review | Admin | Sets status to UNDER_REVIEW |
| Approve | Admin | Sets status to APPROVED |
| Reject | Admin | Sets status to REJECTED, with optional reason |
| Convert to Task | Admin | Creates a new REACT or GOAL_STACK task from the idea. Sets idea status to CONVERTED and links via `taskId`. |
| Archive | Author or Admin | Sets status to ARCHIVED |
| Edit | Author (if SUBMITTED) | Can edit title, description, scores |

### Convert to Task Flow

When admin clicks "Convert to Task":
1. Pre-fill a TaskEditor with:
   - Title from idea title
   - Description from idea description
   - `taskType`: defaults to REACT (since ideas become reactive work), admin can change to GOAL_STACK if linking to a goal
   - Process assignee (if process linked)
2. Admin can adjust all fields before creating
3. On task creation, update Idea: `status = CONVERTED`, `taskId = newTask.id`

## File Upload Infrastructure

### Upload API

**New file:** `src/app/api/upload/route.ts`

```typescript
// POST /api/upload
// - Accepts multipart/form-data
// - Validates: file size (max 10MB), allowed types (image/*, .pdf, .doc, .docx, .xls, .xlsx, .txt)
// - Stores file (Vercel Blob recommended for Vercel hosting)
// - Returns: { fileUrl, fileName, fileSize, mimeType }
```

### Attachment APIs

**Task attachments:**
- `POST /api/tasks/{id}/attachments` — Upload and link attachment to task
- `GET /api/tasks/{id}/attachments` — List task attachments
- `DELETE /api/tasks/{id}/attachments/{attachmentId}` — Remove attachment

**Idea attachments:**
- `POST /api/ideas/{id}/attachments` — Upload and link attachment to idea
- `GET /api/ideas/{id}/attachments` — List idea attachments
- `DELETE /api/ideas/{id}/attachments/{attachmentId}` — Remove attachment

### Upload Component

**New file:** `src/components/ui/FileUploader.tsx`

Reusable drag-and-drop file upload component:
- Drop zone with click-to-browse
- File preview (thumbnails for images, icon + name for others)
- Upload progress indicator
- Remove button per file
- Max file size validation (10MB)
- Accepted file type filtering

## API Routes

### Ideas

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/ideas` | GET | List ideas (with filters, sort, search) | All users |
| `/api/ideas` | POST | Create idea | All users |
| `/api/ideas/[id]` | GET | Idea detail with attachments | All users |
| `/api/ideas/[id]` | PATCH | Update idea (edit, status change) | Author (if SUBMITTED) or Admin |
| `/api/ideas/[id]` | DELETE | Delete idea | Author (if SUBMITTED) or Admin |
| `/api/ideas/[id]/convert` | POST | Convert idea to task | Admin only |
| `/api/ideas/[id]/attachments` | GET/POST/DELETE | Manage attachments | Author or Admin |

### Extended Task Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tasks/[id]/attachments` | GET/POST/DELETE | Manage task attachments |

## Sidebar Navigation

Add two new items:
- **"New Task"** button (or "React Task" quick action) — links to `/tasks/new-react`
- **"Ideas"** — links to `/ideas` (idea database with "New Idea" button inside)

## Testing

1. **React Task Form:** Fill out CARS form, select a process, verify task created and assigned to process owner. Test delegation logic.
2. **Idea Form:** Submit idea with PICS + ICE scores. Verify ICE auto-calculated. Upload attachment.
3. **Idea Database:** Sort by ICE, filter by status, search by title. Click to expand.
4. **Convert to Task:** Admin converts idea → verify task created, idea status set to CONVERTED, taskId linked.
5. **File Upload:** Upload image + PDF. Verify stored and retrievable. Test max size rejection.
6. **Process Search:** Type to filter processes. Verify assignee auto-fills. Test delegation fallback.
7. Run `npx vitest` and `npm run build`.
