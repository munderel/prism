# Reactive Task Form & Idea Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CARS-guided reactive task form, a PICS-guided idea submission form, and a browsable idea database with ICE scoring, file uploads, and process-based auto-assignment.

**Architecture:** Schema first (Idea, IdeaAttachment, TaskAttachment, Task.processId), then pure utilities (ICE score, CARS/PICS formatting, delegation), then API routes (upload, ideas CRUD, task attachments), then UI (ProcessSearch, FileUploader, form pages, database page). File upload uses @vercel/blob.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / @vercel/blob / TailwindCSS / lucide-react

**Spec:** `docs/superpowers/specs/2026-03-24-react-task-form-idea-database-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add Idea, IdeaAttachment, TaskAttachment, IdeaStatus enum, Task.processId |
| `src/lib/ice-score.ts` | Create | `computeIceScore(i, c, e)` pure function |
| `src/lib/cars-description.ts` | Create | CARS and PICS description formatters |
| `src/lib/delegation.ts` | Create | `resolveAssignee(process)` delegation check |
| `src/lib/rate-limit.ts` | Modify | Add `ideaLimiter` and `uploadLimiter` |
| `src/app/api/upload/route.ts` | Create | POST file upload (Vercel Blob) |
| `src/app/api/ideas/route.ts` | Create | GET list (filter/sort/search/paginate), POST create |
| `src/app/api/ideas/[id]/route.ts` | Create | GET detail, PATCH update/status, DELETE |
| `src/app/api/ideas/[id]/convert/route.ts` | Create | POST convert idea to task |
| `src/app/api/ideas/[id]/attachments/route.ts` | Create | GET/POST/DELETE idea attachments |
| `src/app/api/tasks/[id]/attachments/route.ts` | Create | GET/POST/DELETE task attachments |
| `src/app/api/tasks/route.ts` | Modify | Accept processId and ownerId for REACT tasks |
| `src/components/ui/FileUploader.tsx` | Create | Reusable drag-and-drop upload component |
| `src/components/tasks/ProcessSearch.tsx` | Create | Searchable process/responsibility picker |
| `src/app/(app)/tasks/new-react/page.tsx` | Create | CARS reactive task form |
| `src/app/(app)/ideas/page.tsx` | Create | Idea database view |
| `src/app/(app)/ideas/new/page.tsx` | Create | PICS idea submission form |
| `src/components/layout/Sidebar.tsx` | Modify | Add "Ideas" nav item |
| `src/test/fixtures.ts` | Modify | Add createIdea, createProcess helpers |

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add IdeaStatus enum**

```prisma
enum IdeaStatus {
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  CONVERTED
  ARCHIVED
}
```

- [ ] **Step 2: Add Idea model**

```prisma
model Idea {
  id              String     @id @default(cuid())
  authorId        String
  title           String
  description     String     @db.Text
  processId       String?
  confidenceScore Int
  easeScore       Int
  impactScore     Int
  iceScore        Float?
  status          IdeaStatus @default(SUBMITTED)
  taskId          String?    @unique
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
```

- [ ] **Step 3: Add IdeaAttachment and TaskAttachment models**
- [ ] **Step 4: Add processId to Task model**

```prisma
  processId    String?
  process      Process? @relation("TaskProcess", fields: [processId], references: [id])
  attachments  TaskAttachment[]
```

- [ ] **Step 5: Add reverse relations** to User, Process, Task, Goal
- [ ] **Step 6: Run migration**

Run: `npx prisma migrate dev --name add-ideas-and-attachments`

- [ ] **Step 7: Update test fixtures, run tests, commit**

```bash
git add -A && git commit -m "feat(schema): add Idea, IdeaAttachment, TaskAttachment models and Task.processId"
```

---

### Task 2: Pure Utility Functions (TDD)

**Files:**
- Create: `src/lib/ice-score.ts`, `src/lib/cars-description.ts`, `src/lib/delegation.ts`
- Create: `src/__tests__/ice-score.test.ts`, `src/__tests__/cars-description.test.ts`, `src/__tests__/delegation.test.ts`

- [ ] **Step 1: Write failing ICE score tests**

```typescript
// computeIceScore(5, 4, 3) => 20.0  (multiplicative: 5*4*3/3)
// computeIceScore(1, 1, 1) => 0.33
// computeIceScore(5, 5, 5) => 41.67
```

- [ ] **Step 2: Implement ICE score**

```typescript
export function computeIceScore(impact: number, confidence: number, ease: number): number {
  return Math.round((impact * confidence * ease) / 3 * 100) / 100;
}
```

- [ ] **Step 3: Write failing CARS/PICS tests**

```typescript
// formatCarsDescription(c, a, r, s) => "**Context:** ...\n**Attempts:** ...\n**Request:** ...\n**Stakes:** ..."
// formatPicsDescription(p, i, c, s) => "**Problem:** ...\n**Idea:** ...\n**Cost:** ...\n**Stakes:** ..."
```

- [ ] **Step 4: Implement formatters**
- [ ] **Step 5: Write failing delegation tests**

```typescript
// resolveAssignee(process with delegateId + valid delegateUntil) => delegateId
// resolveAssignee(process with expired delegateUntil) => assigneeId
// resolveAssignee(process with no delegate) => assigneeId
// resolveAssignee(process with no assignee) => null
```

- [ ] **Step 6: Implement delegation resolver**
- [ ] **Step 7: Run all tests, commit**

```bash
git add -A && git commit -m "feat: add ICE score, CARS/PICS formatters, and delegation resolver utilities"
```

---

### Task 3: Rate Limiters + File Upload

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Create: `src/app/api/upload/route.ts`
- Create: `src/components/ui/FileUploader.tsx`

- [ ] **Step 1: Add ideaLimiter and uploadLimiter** to rate-limit.ts
- [ ] **Step 2: Install @vercel/blob**

Run: `npm install @vercel/blob`

- [ ] **Step 3: Create upload API route**

```typescript
// POST /api/upload — multipart form data
// Validates: 10MB max, allowed MIME types
// Stores via put() from @vercel/blob
// Returns: { fileUrl, fileName, fileSize, mimeType }
```

- [ ] **Step 4: Create FileUploader component**

Drag-and-drop zone, file preview (thumbnails for images, icon for others), upload progress, remove button, validation.

- [ ] **Step 5: Run tests, commit**

```bash
git add -A && git commit -m "feat: add file upload API and reusable FileUploader component"
```

---

### Task 4: ProcessSearch Component

**Files:**
- Create: `src/components/tasks/ProcessSearch.tsx`
- Create: `src/components/tasks/__tests__/ProcessSearch.test.tsx`

- [ ] **Step 1: Write failing tests** — renders, search filters, selection emits process + assignee
- [ ] **Step 2: Implement ProcessSearch**

Fetches from `/api/processes`, displays as `{Function} > {Process} — {Assignee}`, searchable, uses delegation resolver for auto-assignment.

- [ ] **Step 3: Run tests, commit**

```bash
git add -A && git commit -m "feat: add ProcessSearch component for process/responsibility picker"
```

---

### Task 5: Task API Extension

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/attachments/route.ts`

- [ ] **Step 1: Accept processId in POST** — add to destructuring and create data
- [ ] **Step 2: Accept ownerId for REACT tasks** — allow assigning to another user
- [ ] **Step 3: Create task attachments route** — GET/POST/DELETE
- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: extend task API with processId, ownerId, and attachments"
```

---

### Task 6: Ideas CRUD API

**Files:**
- Create: `src/app/api/ideas/route.ts`
- Create: `src/app/api/ideas/[id]/route.ts`
- Create: `src/app/api/ideas/[id]/convert/route.ts`
- Create: `src/app/api/ideas/[id]/attachments/route.ts`

- [ ] **Step 1: Create GET /api/ideas** — list with filters (status), sort (iceScore, createdAt), search (title/description), pagination (20/page)
- [ ] **Step 2: Create POST /api/ideas** — validate scores 1-5, compute iceScore server-side
- [ ] **Step 3: Create GET/PATCH/DELETE /api/ideas/[id]** — author edit (if SUBMITTED) or admin
- [ ] **Step 4: Create POST /api/ideas/[id]/convert** — admin only, creates task, sets CONVERTED status + taskId
- [ ] **Step 5: Create attachments route** — GET/POST/DELETE
- [ ] **Step 6: Run tests, commit**

```bash
git add -A && git commit -m "feat: add Ideas CRUD API with ICE scoring and task conversion"
```

---

### Task 7: CARS Reactive Task Form Page

**Files:**
- Create: `src/app/(app)/tasks/new-react/page.tsx`

- [ ] **Step 1: Build form layout** with collapsible CARS explanation, title input, ProcessSearch, 4 CARS text areas, deadline guidelines (collapsible), date picker, priority selector (default HIGH), duration picker, FileUploader
- [ ] **Step 2: Wire form submission** — POST to /api/tasks with CARS-formatted description, processId, ownerId from delegation resolver
- [ ] **Step 3: Add success redirect** to /tasks
- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: add CARS reactive task creation form page"
```

---

### Task 8: PICS Idea Form Page

**Files:**
- Create: `src/app/(app)/ideas/new/page.tsx`

- [ ] **Step 1: Build form layout** with collapsible PICS explanation, title input, 4 PICS text areas, ProcessSearch (optional), ICE score selectors (1-5 buttons each), FileUploader
- [ ] **Step 2: Wire form submission** — POST to /api/ideas with PICS-formatted description and scores
- [ ] **Step 3: Add success redirect** to /ideas
- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: add PICS idea submission form page"
```

---

### Task 9: Idea Database Page

**Files:**
- Create: `src/app/(app)/ideas/page.tsx`

- [ ] **Step 1: Build page layout** — header with "New Idea" button, filter/sort/search bar
- [ ] **Step 2: Implement idea cards** — expandable, show title/ICE/status/author/date/process, expand for full PICS description + attachments
- [ ] **Step 3: Add admin actions** — Review, Approve, Reject, Convert to Task, Archive
- [ ] **Step 4: Add pagination** — 20 per page with load-more
- [ ] **Step 5: Wire Convert to Task** — opens TaskEditor pre-filled from idea
- [ ] **Step 6: Run tests, commit**

```bash
git add -A && git commit -m "feat: add Idea Database page with sorting, filtering, and admin actions"
```

---

### Task 10: Sidebar Navigation + Final Verification

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add nav items** — "Ideas" link to /ideas (icon: Lightbulb)
- [ ] **Step 2: Run full test suite** — `npx vitest run`
- [ ] **Step 3: Run build** — `npm run build`
- [ ] **Step 4: Manual smoke test** — create CARS task via form, submit idea with PICS, browse idea database, convert idea to task, upload files
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Ideas to sidebar navigation"
```
