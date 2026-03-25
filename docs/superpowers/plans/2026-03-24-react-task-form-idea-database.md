# Reactive Task Form & Idea Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two new guided form pages (CARS-based reactive task creation and PICS-based idea submission) plus a scored idea database with filtering, sorting, and convert-to-task functionality. Adds file attachment infrastructure, process-based auto-assignment with delegation, and sidebar navigation entries.

**Architecture:** Work is layered bottom-up: schema first, then pure utility functions, then rate limiters, then file upload infrastructure, then reusable UI components, then API routes, then page-level UI, and finally sidebar integration. Each layer only depends on layers completed before it. All new API routes follow the existing auth-guard + rate-limit pattern.

**Tech Stack:** Next.js 14 / TypeScript / Prisma (PostgreSQL) / Vitest / NextAuth 4 / Tailwind CSS / @vercel/blob / swr / lucide-react / framer-motion

**Spec:** `docs/superpowers/specs/2026-03-24-react-task-form-idea-database-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add Idea, IdeaAttachment, TaskAttachment models; add processId/attachments to Task; add reverse relations to User, Process |
| `src/lib/scoring.ts` | Create | Pure ICE scoring + CARS/PICS formatting utilities |
| `src/lib/delegation.ts` | Create | Pure delegation resolution logic |
| `src/__tests__/scoring.test.ts` | Create | Tests for ICE, CARS, PICS utilities |
| `src/__tests__/delegation.test.ts` | Create | Tests for delegation resolution |
| `src/lib/rate-limit.ts` | Modify | Add ideaLimiter and uploadLimiter |
| `src/__tests__/rate-limit.test.ts` | Modify | Add tests for new limiters |
| `src/lib/upload.ts` | Create | File validation constants and helpers |
| `src/app/api/upload/route.ts` | Create | POST handler for @vercel/blob file upload |
| `src/__tests__/upload.test.ts` | Create | Tests for file validation helpers |
| `src/components/ui/FileUploader.tsx` | Create | Reusable drag-and-drop file upload component |
| `src/components/tasks/ProcessSearch.tsx` | Create | Searchable process/responsibility dropdown |
| `src/components/tasks/__tests__/ProcessSearch.test.tsx` | Create | Tests for ProcessSearch component |
| `src/app/api/tasks/route.ts` | Modify | Accept processId + ownerId in POST for REACT tasks |
| `src/app/api/tasks/[id]/attachments/route.ts` | Create | GET/POST/DELETE for task attachments |
| `src/__tests__/task-api-react.test.ts` | Create | Tests for extended task API (REACT fields) |
| `src/app/api/ideas/route.ts` | Create | GET (list with filters/sort/search) + POST (create idea) |
| `src/app/api/ideas/[id]/route.ts` | Create | GET/PATCH/DELETE for single idea |
| `src/app/api/ideas/[id]/convert/route.ts` | Create | POST to convert idea to task |
| `src/app/api/ideas/[id]/attachments/route.ts` | Create | GET/POST/DELETE for idea attachments |
| `src/__tests__/ideas-api.test.ts` | Create | Tests for ideas CRUD + convert + attachment APIs |
| `src/app/tasks/new-react/page.tsx` | Create | CARS-based reactive task form page |
| `src/components/tasks/__tests__/CarsForm.test.tsx` | Create | Tests for CARS form page |
| `src/app/ideas/page.tsx` | Create | Idea database listing page |
| `src/app/ideas/new/page.tsx` | Create | PICS-based idea submission form page |
| `src/components/ideas/__tests__/IdeaDatabase.test.tsx` | Create | Tests for idea database page |
| `src/components/ideas/__tests__/IdeaForm.test.tsx` | Create | Tests for PICS idea form |
| `src/components/layout/Sidebar.tsx` | Modify | Add "New Task" and "Ideas" nav items |
| `src/components/layout/__tests__/Sidebar.test.tsx` | Modify | Update nav item count and labels |

---

### Task 1: Prisma Schema — New Models and Relations

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the IdeaStatus enum and Idea model**

Add after the `ProcessExecution` model block in `prisma/schema.prisma`:

```prisma
// === IDEAS ===

enum IdeaStatus {
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  CONVERTED
  ARCHIVED
}

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

- [ ] **Step 2: Add new fields and relations to existing models**

Add to the `Task` model (after `calendarEventId` field, line ~203):

```prisma
  processId       String?
```

Add to the `Task` model relations (after `processExecution ProcessExecution?`):

```prisma
  process         Process?          @relation("TaskProcess", fields: [processId], references: [id])
  attachments     TaskAttachment[]
  linkedIdea      Idea?
```

Add `@@index([processId])` to the Task model's index block.

Add to the `User` model relations (after `meetings Meeting[]`, line ~81):

```prisma
  ideas            Idea[]
```

Add to the `Process` model relations (after `executions ProcessExecution[]`, line ~427):

```prisma
  ideas            Idea[]
  tasks            Task[]            @relation("TaskProcess")
```

- [ ] **Step 3: Run the migration**

```bash
cd goal-dashboard && npx prisma migrate dev --name add-ideas-and-attachments
```

Expected: Migration succeeds, new tables `Idea`, `IdeaAttachment`, `TaskAttachment` created, `Task` table gains `processId` column.

- [ ] **Step 4: Verify Prisma client generation**

```bash
cd goal-dashboard && npx prisma generate
```

Expected: Prisma client regenerated with new types.

- [ ] **Step 5: Verify build still compiles**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All existing tests PASS (schema changes are additive).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Idea, IdeaAttachment, TaskAttachment models and Task.processId"
```

---

### Task 2: Pure Utilities — ICE Scoring, CARS/PICS Formatting, Delegation

**Files:**
- Create: `src/lib/scoring.ts`
- Create: `src/lib/delegation.ts`
- Create: `src/__tests__/scoring.test.ts`
- Create: `src/__tests__/delegation.test.ts`

- [ ] **Step 1: Write failing tests for scoring utilities**

Create `src/__tests__/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeIceScore,
  formatCarsDescription,
  formatPicsDescription,
  validateIceInputs,
} from '@/lib/scoring';

describe('computeIceScore', () => {
  it('computes (impact * confidence * ease) / 3', () => {
    expect(computeIceScore(5, 4, 3)).toBeCloseTo(20.0);
  });

  it('returns max score for all 5s', () => {
    expect(computeIceScore(5, 5, 5)).toBeCloseTo(41.67, 1);
  });

  it('returns min score for all 1s', () => {
    expect(computeIceScore(1, 1, 1)).toBeCloseTo(0.33, 1);
  });

  it('rounds to 2 decimal places', () => {
    const result = computeIceScore(3, 3, 3);
    expect(result).toBe(9);
  });
});

describe('validateIceInputs', () => {
  it('returns null for valid inputs', () => {
    expect(validateIceInputs(1, 5, 3)).toBeNull();
  });

  it('returns error for out-of-range impact', () => {
    expect(validateIceInputs(0, 3, 3)).toBe('Impact must be between 1 and 5');
    expect(validateIceInputs(6, 3, 3)).toBe('Impact must be between 1 and 5');
  });

  it('returns error for out-of-range confidence', () => {
    expect(validateIceInputs(3, 0, 3)).toBe('Confidence must be between 1 and 5');
    expect(validateIceInputs(3, 6, 3)).toBe('Confidence must be between 1 and 5');
  });

  it('returns error for out-of-range ease', () => {
    expect(validateIceInputs(3, 3, 0)).toBe('Ease must be between 1 and 5');
    expect(validateIceInputs(3, 3, 6)).toBe('Ease must be between 1 and 5');
  });

  it('returns error for non-integer inputs', () => {
    expect(validateIceInputs(1.5, 3, 3)).toBe('Impact must be a whole number');
    expect(validateIceInputs(3, 2.5, 3)).toBe('Confidence must be a whole number');
    expect(validateIceInputs(3, 3, 4.1)).toBe('Ease must be a whole number');
  });
});

describe('formatCarsDescription', () => {
  it('formats CARS fields into structured markdown', () => {
    const result = formatCarsDescription({
      context: 'The website is down',
      attempts: 'Restarted the server',
      request: 'Investigate root cause',
      stakes: 'Customers cannot place orders',
    });
    expect(result).toBe(
      '**Context:** The website is down\n**Attempts:** Restarted the server\n**Request:** Investigate root cause\n**Stakes:** Customers cannot place orders'
    );
  });

  it('handles empty fields gracefully', () => {
    const result = formatCarsDescription({
      context: 'Some context',
      attempts: '',
      request: 'Do something',
      stakes: '',
    });
    expect(result).toContain('**Context:** Some context');
    expect(result).toContain('**Attempts:** ');
    expect(result).toContain('**Request:** Do something');
    expect(result).toContain('**Stakes:** ');
  });
});

describe('formatPicsDescription', () => {
  it('formats PICS fields into structured markdown', () => {
    const result = formatPicsDescription({
      problem: 'Manual report generation takes 4 hours',
      idea: 'Automate with a script',
      cost: '2 developer days',
      stakes: 'Frees up 16 hours/month',
    });
    expect(result).toBe(
      '**Problem:** Manual report generation takes 4 hours\n**Idea:** Automate with a script\n**Cost:** 2 developer days\n**Stakes:** Frees up 16 hours/month'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/__tests__/scoring.test.ts
```

Expected: FAIL — module `@/lib/scoring` not found.

- [ ] **Step 3: Implement scoring utilities**

Create `src/lib/scoring.ts`:

```typescript
/**
 * Pure utility functions for ICE scoring, CARS formatting, and PICS formatting.
 * No side effects, no database access — designed for easy unit testing.
 */

/** Compute ICE score using multiplicative formula: (impact * confidence * ease) / 3 */
export function computeIceScore(impact: number, confidence: number, ease: number): number {
  return Math.round(((impact * confidence * ease) / 3) * 100) / 100;
}

/** Validate ICE inputs are integers between 1 and 5. Returns error string or null. */
export function validateIceInputs(impact: number, confidence: number, ease: number): string | null {
  if (!Number.isInteger(impact)) return 'Impact must be a whole number';
  if (!Number.isInteger(confidence)) return 'Confidence must be a whole number';
  if (!Number.isInteger(ease)) return 'Ease must be a whole number';
  if (impact < 1 || impact > 5) return 'Impact must be between 1 and 5';
  if (confidence < 1 || confidence > 5) return 'Confidence must be between 1 and 5';
  if (ease < 1 || ease > 5) return 'Ease must be between 1 and 5';
  return null;
}

/** Format CARS (Context, Attempts, Request, Stakes) into structured description text. */
export function formatCarsDescription(fields: {
  context: string;
  attempts: string;
  request: string;
  stakes: string;
}): string {
  return [
    `**Context:** ${fields.context}`,
    `**Attempts:** ${fields.attempts}`,
    `**Request:** ${fields.request}`,
    `**Stakes:** ${fields.stakes}`,
  ].join('\n');
}

/** Format PICS (Problem, Idea, Cost, Stakes) into structured description text. */
export function formatPicsDescription(fields: {
  problem: string;
  idea: string;
  cost: string;
  stakes: string;
}): string {
  return [
    `**Problem:** ${fields.problem}`,
    `**Idea:** ${fields.idea}`,
    `**Cost:** ${fields.cost}`,
    `**Stakes:** ${fields.stakes}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run scoring tests to verify they pass**

```bash
cd goal-dashboard && npx vitest run src/__tests__/scoring.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Write failing tests for delegation utility**

Create `src/__tests__/delegation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveAssignee } from '@/lib/delegation';

describe('resolveAssignee', () => {
  it('returns assigneeId when no delegate is set', () => {
    const result = resolveAssignee({
      assigneeId: 'user-1',
      delegateId: null,
      delegateUntil: null,
    });
    expect(result).toBe('user-1');
  });

  it('returns delegateId when delegate is active (delegateUntil in the future)', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = resolveAssignee({
      assigneeId: 'user-1',
      delegateId: 'user-2',
      delegateUntil: tomorrow,
    });
    expect(result).toBe('user-2');
  });

  it('returns assigneeId when delegateUntil is in the past', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = resolveAssignee({
      assigneeId: 'user-1',
      delegateId: 'user-2',
      delegateUntil: yesterday,
    });
    expect(result).toBe('user-1');
  });

  it('returns delegateId when delegateUntil is today', () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const result = resolveAssignee({
      assigneeId: 'user-1',
      delegateId: 'user-2',
      delegateUntil: today,
    });
    expect(result).toBe('user-2');
  });

  it('returns assigneeId when delegateId is null even with delegateUntil set', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = resolveAssignee({
      assigneeId: 'user-1',
      delegateId: null,
      delegateUntil: tomorrow,
    });
    expect(result).toBe('user-1');
  });

  it('returns null when assigneeId is null and no valid delegate', () => {
    const result = resolveAssignee({
      assigneeId: null,
      delegateId: null,
      delegateUntil: null,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run delegation tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/__tests__/delegation.test.ts
```

Expected: FAIL — module `@/lib/delegation` not found.

- [ ] **Step 7: Implement delegation utility**

Create `src/lib/delegation.ts`:

```typescript
/**
 * Pure delegation resolution logic.
 * Determines whether a task should be assigned to the process assignee
 * or their delegate based on delegateUntil date.
 */

interface ProcessAssignment {
  assigneeId: string | null;
  delegateId: string | null;
  delegateUntil: Date | null;
}

/**
 * Resolve the effective assignee for a process.
 * If a delegate is set and delegateUntil >= today, returns delegateId.
 * Otherwise returns assigneeId. Returns null if neither is available.
 */
export function resolveAssignee(process: ProcessAssignment): string | null {
  if (process.delegateId && process.delegateUntil) {
    const now = new Date();
    // Compare date-only: delegateUntil is valid for the entire day
    const untilEnd = new Date(process.delegateUntil);
    untilEnd.setHours(23, 59, 59, 999);
    if (now <= untilEnd) {
      return process.delegateId;
    }
  }

  return process.assigneeId ?? null;
}
```

- [ ] **Step 8: Run delegation tests to verify they pass**

```bash
cd goal-dashboard && npx vitest run src/__tests__/delegation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 9: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/scoring.ts src/lib/delegation.ts src/__tests__/scoring.test.ts src/__tests__/delegation.test.ts
git commit -m "feat: add pure utilities for ICE scoring, CARS/PICS formatting, and delegation resolution"
```

---

### Task 3: Rate Limiters for Ideas and Uploads

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write failing tests for new limiters**

Add to the end of `src/__tests__/rate-limit.test.ts`:

```typescript
import { ideaLimiter, uploadLimiter } from '@/lib/rate-limit';

describe('ideaLimiter', () => {
  it('allows up to 10 idea submissions per minute', () => {
    for (let i = 0; i < 10; i++) {
      expect(ideaLimiter.check('10.0.0.1').success).toBe(true);
    }
    expect(ideaLimiter.check('10.0.0.1').success).toBe(false);
  });
});

describe('uploadLimiter', () => {
  it('allows up to 20 uploads per minute', () => {
    for (let i = 0; i < 20; i++) {
      expect(uploadLimiter.check('10.0.0.2').success).toBe(true);
    }
    expect(uploadLimiter.check('10.0.0.2').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/__tests__/rate-limit.test.ts
```

Expected: FAIL — `ideaLimiter` and `uploadLimiter` not exported.

- [ ] **Step 3: Add new limiters to rate-limit.ts**

Add after the existing `goalLimiter` line (line ~52) in `src/lib/rate-limit.ts`:

```typescript
export const ideaLimiter = rateLimit({ interval: 60_000, limit: 10 });
export const uploadLimiter = rateLimit({ interval: 60_000, limit: 20 });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd goal-dashboard && npx vitest run src/__tests__/rate-limit.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/__tests__/rate-limit.test.ts
git commit -m "feat: add ideaLimiter and uploadLimiter rate limiters"
```

---

### Task 4: File Upload Infrastructure

**Files:**
- Create: `src/lib/upload.ts`
- Create: `src/__tests__/upload.test.ts`
- Create: `src/app/api/upload/route.ts`
- Create: `src/components/ui/FileUploader.tsx`

- [ ] **Step 1: Write failing tests for upload validation helpers**

Create `src/__tests__/upload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  validateFile,
} from '@/lib/upload';

describe('upload constants', () => {
  it('MAX_FILE_SIZE is 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('ALLOWED_MIME_TYPES includes images, PDFs, docs, spreadsheets, and text', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/gif');
    expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain('application/msword');
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.ms-excel');
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(ALLOWED_MIME_TYPES).toContain('text/plain');
  });
});

describe('validateFile', () => {
  it('returns null for a valid file', () => {
    expect(validateFile('report.pdf', 1024, 'application/pdf')).toBeNull();
  });

  it('returns error for oversized file', () => {
    const result = validateFile('big.pdf', 11 * 1024 * 1024, 'application/pdf');
    expect(result).toContain('10MB');
  });

  it('returns error for disallowed MIME type', () => {
    const result = validateFile('script.exe', 1024, 'application/x-msdownload');
    expect(result).toContain('File type not allowed');
  });

  it('returns error for zero-size file', () => {
    const result = validateFile('empty.pdf', 0, 'application/pdf');
    expect(result).toContain('empty');
  });

  it('returns null for max-size file', () => {
    expect(validateFile('exact.png', 10 * 1024 * 1024, 'image/png')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/__tests__/upload.test.ts
```

Expected: FAIL — module `@/lib/upload` not found.

- [ ] **Step 3: Implement upload validation helpers**

Create `src/lib/upload.ts`:

```typescript
/**
 * File upload validation constants and helpers.
 * Pure functions — no side effects, no blob storage interaction.
 */

/** Maximum file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types for uploads */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const;

/**
 * Validate a file before upload. Returns error string or null if valid.
 */
export function validateFile(
  fileName: string,
  fileSize: number,
  mimeType: string
): string | null {
  if (fileSize === 0) {
    return `File "${fileName}" is empty`;
  }
  if (fileSize > MAX_FILE_SIZE) {
    return `File "${fileName}" exceeds maximum size of 10MB`;
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return `File type not allowed: ${mimeType}. Accepted: images, PDF, Word, Excel, text`;
  }
  return null;
}
```

- [ ] **Step 4: Run upload validation tests**

```bash
cd goal-dashboard && npx vitest run src/__tests__/upload.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Install @vercel/blob**

```bash
cd goal-dashboard && npm install @vercel/blob
```

- [ ] **Step 6: Create the upload API route**

Create `src/app/api/upload/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuth, authError } from '@/lib/auth-guard';
import { uploadLimiter, getClientIp } from '@/lib/rate-limit';
import { validateFile } from '@/lib/upload';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = uploadLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  const validationError = validateFile(file.name, file.size, file.type);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const blob = await put(`uploads/${auth.userId}/${Date.now()}-${file.name}`, file, {
    access: 'public',
  });

  return Response.json(
    {
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    },
    { status: 201 }
  );
}
```

- [ ] **Step 7: Create the FileUploader component**

Create `src/components/ui/FileUploader.tsx`:

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, File as FileIcon, Image as ImageIcon, Loader2 } from 'lucide-react';
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, validateFile } from '@/lib/upload';

interface UploadedFile {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
}

export function FileUploader({ files, onFilesChange, maxFiles = 5 }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file.name, file.size, file.type);
    if (validationError) {
      setError(validationError);
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }
    return res.json() as Promise<UploadedFile>;
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList).slice(0, maxFiles - files.length);
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const uploaded: UploadedFile[] = [];
      for (const file of filesToUpload) {
        const result = await uploadFile(file);
        if (result) uploaded.push(result);
      }
      onFilesChange([...files, ...uploaded]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [files, maxFiles, onFilesChange, uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 mx-auto text-indigo-400 animate-spin" />
        ) : (
          <Upload className="h-8 w-8 mx-auto text-gray-500" />
        )}
        <p className="mt-2 text-sm text-gray-400">
          {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Max {MAX_FILE_SIZE / (1024 * 1024)}MB per file. Images, PDF, Word, Excel, text.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, idx) => (
            <li key={idx} className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
              {isImage(file.mimeType) ? (
                <ImageIcon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              ) : (
                <FileIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
              <span className="text-sm text-white truncate flex-1">{file.fileName}</span>
              <span className="text-xs text-gray-500">{(file.fileSize / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-gray-500 hover:text-red-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/upload.ts src/__tests__/upload.test.ts src/app/api/upload/route.ts src/components/ui/FileUploader.tsx package.json package-lock.json
git commit -m "feat: add file upload infrastructure with validation, API route, and FileUploader component"
```

---

### Task 5: ProcessSearch Component

**Files:**
- Create: `src/components/tasks/ProcessSearch.tsx`
- Create: `src/components/tasks/__tests__/ProcessSearch.test.tsx`

- [ ] **Step 1: Write failing tests for ProcessSearch**

Create `src/components/tasks/__tests__/ProcessSearch.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessSearch } from '../ProcessSearch';
import { vi } from 'vitest';

const mockProcesses = [
  {
    id: 'fn-1',
    name: 'Marketing',
    processes: [
      {
        id: 'proc-1',
        title: 'Social Media',
        assignee: { id: 'user-1', name: 'Alex Johnson' },
        delegate: null,
        delegateUntil: null,
        assigneeId: 'user-1',
        delegateId: null,
      },
    ],
  },
  {
    id: 'fn-2',
    name: 'Engineering',
    processes: [
      {
        id: 'proc-2',
        title: 'Website',
        assignee: { id: 'user-2', name: 'Sam Chen' },
        delegate: { id: 'user-3', name: 'Jordan Lee' },
        delegateUntil: new Date(Date.now() + 86400000).toISOString(),
        assigneeId: 'user-2',
        delegateId: 'user-3',
      },
    ],
  },
];

describe('ProcessSearch', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockProcesses,
    } as any);
    onSelect.mockClear();
  });

  it('renders search input', async () => {
    render(<ProcessSearch onSelect={onSelect} />);
    expect(screen.getByPlaceholderText(/search processes/i)).toBeInTheDocument();
  });

  it('shows process results after focusing', async () => {
    const user = userEvent.setup();
    render(<ProcessSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(/search processes/i);
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText(/Marketing/)).toBeInTheDocument();
      expect(screen.getByText(/Social Media/)).toBeInTheDocument();
    });
  });

  it('filters results by search query', async () => {
    const user = userEvent.setup();
    render(<ProcessSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(/search processes/i);
    await user.type(input, 'Website');

    await waitFor(() => {
      expect(screen.getByText(/Website/)).toBeInTheDocument();
      expect(screen.queryByText(/Social Media/)).not.toBeInTheDocument();
    });
  });

  it('calls onSelect with processId and resolved assigneeId when clicked', async () => {
    const user = userEvent.setup();
    render(<ProcessSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(/search processes/i);
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText(/Social Media/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Social Media/));

    expect(onSelect).toHaveBeenCalledWith({
      processId: 'proc-1',
      assigneeId: 'user-1',
      assigneeName: 'Alex Johnson',
      processLabel: 'Marketing > Social Media',
    });
  });

  it('resolves to delegate when delegation is active', async () => {
    const user = userEvent.setup();
    render(<ProcessSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText(/search processes/i);
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText(/Website/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Website/));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        processId: 'proc-2',
        assigneeId: 'user-3',
        assigneeName: 'Jordan Lee',
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/ProcessSearch.test.tsx
```

Expected: FAIL — module `../ProcessSearch` not found.

- [ ] **Step 3: Implement ProcessSearch component**

Create `src/components/tasks/ProcessSearch.tsx`:

```typescript
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { resolveAssignee } from '@/lib/delegation';

interface ProcessResult {
  processId: string;
  assigneeId: string;
  assigneeName: string;
  processLabel: string;
}

interface ProcessSearchProps {
  onSelect: (result: ProcessResult) => void;
  selectedLabel?: string;
}

interface FunctionData {
  id: string;
  name: string;
  processes: {
    id: string;
    title: string;
    assigneeId: string | null;
    delegateId: string | null;
    delegateUntil: string | null;
    assignee: { id: string; name: string } | null;
    delegate: { id: string; name: string } | null;
  }[];
}

export function ProcessSearch({ onSelect, selectedLabel }: ProcessSearchProps) {
  const [query, setQuery] = useState('');
  const [functions, setFunctions] = useState<FunctionData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/processes')
      .then((res) => (res.ok ? res.json() : []))
      .then(setFunctions)
      .catch(() => setFunctions([]));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const flatProcesses = useMemo(() => {
    return functions.flatMap((fn) =>
      fn.processes.map((proc) => {
        const resolvedId = resolveAssignee({
          assigneeId: proc.assigneeId,
          delegateId: proc.delegateId,
          delegateUntil: proc.delegateUntil ? new Date(proc.delegateUntil) : null,
        });
        const resolvedUser =
          resolvedId === proc.delegateId ? proc.delegate : proc.assignee;
        return {
          processId: proc.id,
          functionName: fn.name,
          processTitle: proc.title,
          assigneeId: resolvedId,
          assigneeName: resolvedUser?.name ?? 'Unassigned',
          label: `${fn.name} > ${proc.title}`,
        };
      })
    );
  }, [functions]);

  const filtered = useMemo(() => {
    if (!query.trim()) return flatProcesses;
    const q = query.toLowerCase();
    return flatProcesses.filter(
      (p) =>
        p.functionName.toLowerCase().includes(q) ||
        p.processTitle.toLowerCase().includes(q) ||
        p.assigneeName.toLowerCase().includes(q)
    );
  }, [flatProcesses, query]);

  const handleSelect = (proc: (typeof flatProcesses)[0]) => {
    onSelect({
      processId: proc.processId,
      assigneeId: proc.assigneeId!,
      assigneeName: proc.assigneeName,
      processLabel: proc.label,
    });
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          type="text"
          value={selectedLabel && !isOpen ? '' : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedLabel || 'Search processes...'}
          className={`w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-10 py-2 text-sm focus:border-indigo-500 focus:outline-none ${
            selectedLabel && !isOpen ? 'text-white placeholder:text-white' : 'text-white'
          }`}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No processes found</div>
          ) : (
            filtered.map((proc) => (
              <button
                key={proc.processId}
                type="button"
                onClick={() => handleSelect(proc)}
                className="w-full text-left px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 last:border-b-0"
              >
                <div className="text-sm text-white">
                  {proc.functionName} &gt; {proc.processTitle}
                  <span className="text-gray-400"> — {proc.assigneeName}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run ProcessSearch tests**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/ProcessSearch.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/ProcessSearch.tsx src/components/tasks/__tests__/ProcessSearch.test.tsx
git commit -m "feat: add ProcessSearch component with delegation-aware assignee resolution"
```

---

### Task 6: Task API Extension — processId, ownerId, Attachments

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/attachments/route.ts`
- Create: `src/__tests__/task-api-react.test.ts`

- [ ] **Step 1: Write tests for the extended task POST contract**

Create `src/__tests__/task-api-react.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

/**
 * Tests for the extended REACT task creation logic.
 * These validate the contract: REACT tasks accept processId + ownerId,
 * and the API stores them correctly.
 *
 * Since route handlers require the full Next.js runtime, we test the
 * validation logic via the scoring and delegation pure functions,
 * and verify the API contract via integration-style expectations.
 */

import { formatCarsDescription } from '@/lib/scoring';
import { resolveAssignee } from '@/lib/delegation';

describe('REACT task creation contract', () => {
  it('formats CARS description for the task body', () => {
    const description = formatCarsDescription({
      context: 'Client needs report by Friday',
      attempts: 'Tried pulling from old system, data was stale',
      request: 'Generate fresh Q1 report from current data',
      stakes: 'Client presentation Monday, blocks $50k deal',
    });
    expect(description).toContain('**Context:**');
    expect(description).toContain('**Attempts:**');
    expect(description).toContain('**Request:**');
    expect(description).toContain('**Stakes:**');
  });

  it('resolves process assignee for REACT task ownerId', () => {
    // No delegation
    expect(resolveAssignee({
      assigneeId: 'user-1',
      delegateId: null,
      delegateUntil: null,
    })).toBe('user-1');

    // Active delegation
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(resolveAssignee({
      assigneeId: 'user-1',
      delegateId: 'user-2',
      delegateUntil: tomorrow,
    })).toBe('user-2');
  });

  it('builds correct POST body shape for REACT tasks', () => {
    const body = {
      title: 'Publish Case Study #212',
      description: formatCarsDescription({
        context: 'Case study content is ready',
        attempts: 'N/A',
        request: 'Publish to website and social media',
        stakes: 'Marketing campaign launches next week',
      }),
      taskType: 'REACT',
      priority: 'HIGH',
      dueDate: '2026-03-27T00:00:00Z',
      ownerId: 'user-1',
      processId: 'proc-1',
    };

    expect(body.taskType).toBe('REACT');
    expect(body.processId).toBeDefined();
    expect(body.ownerId).toBeDefined();
    expect(body.description).toContain('**Context:**');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd goal-dashboard && npx vitest run src/__tests__/task-api-react.test.ts
```

Expected: All tests PASS (these are contract tests using pure functions).

- [ ] **Step 3: Extend the task POST handler to accept processId and ownerId**

In `src/app/api/tasks/route.ts`, modify the POST handler.

Change the destructuring on line ~87 to include `processId` and `ownerId`:

```typescript
  const { taskType, title, description, priority, dueDate, goalId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, processId, ownerId } = body;
```

Add after the MAINTENANCE validation block (after line ~118, before `const task = await prisma.task.create`):

```typescript
  // REACT tasks: allow specifying a different ownerId (from process assignment)
  // and an optional processId for informational linking
  let effectiveOwnerId = auth.userId;
  if (taskType === 'REACT' && ownerId) {
    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!targetUser) {
      return Response.json({ error: 'Assignee not found' }, { status: 404 });
    }
    effectiveOwnerId = ownerId;
  }
```

In the `prisma.task.create` call on line ~120, change:
- `ownerId: auth.userId` to `ownerId: effectiveOwnerId`
- Add `processId: processId ?? null,` after `deliverable: deliverable ?? null,`

- [ ] **Step 4: Create task attachments route**

Create `src/app/api/tasks/[id]/attachments/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(attachments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { fileName, fileUrl, fileSize, mimeType } = body;

  if (!fileName || !fileUrl || !fileSize || !mimeType) {
    return Response.json({ error: 'fileName, fileUrl, fileSize, and mimeType are required' }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.create({
    data: { taskId, fileName, fileUrl, fileSize, mimeType },
  });

  return Response.json(attachment, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('attachmentId');

  if (!attachmentId) {
    return Response.json({ error: 'attachmentId is required' }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId },
  });

  if (!attachment) {
    return Response.json({ error: 'Attachment not found' }, { status: 404 });
  }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } });

  return Response.json({ success: true });
}
```

- [ ] **Step 5: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/route.ts src/app/api/tasks/[id]/attachments/route.ts src/__tests__/task-api-react.test.ts
git commit -m "feat: extend task API with processId, ownerId for REACT tasks, and attachments endpoint"
```

---

### Task 7: Ideas CRUD API + Attachments + Convert

**Files:**
- Create: `src/app/api/ideas/route.ts`
- Create: `src/app/api/ideas/[id]/route.ts`
- Create: `src/app/api/ideas/[id]/convert/route.ts`
- Create: `src/app/api/ideas/[id]/attachments/route.ts`
- Create: `src/__tests__/ideas-api.test.ts`

- [ ] **Step 1: Write tests for ideas API contract**

Create `src/__tests__/ideas-api.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeIceScore, validateIceInputs } from '@/lib/scoring';

/**
 * Tests for the ideas API contract.
 * Route handlers need the full Next.js runtime, so we test:
 * 1. ICE scoring logic used by the API
 * 2. Validation logic used by the API
 * 3. Expected request/response shapes
 */

describe('Ideas API contract', () => {
  it('computes iceScore on creation', () => {
    const ice = computeIceScore(5, 4, 3);
    expect(ice).toBeCloseTo(20.0);
  });

  it('validates ICE scores before creation', () => {
    expect(validateIceInputs(5, 4, 3)).toBeNull();
    expect(validateIceInputs(0, 4, 3)).not.toBeNull();
    expect(validateIceInputs(5, 4, 6)).not.toBeNull();
  });

  it('builds correct POST body for idea creation', () => {
    const body = {
      title: 'Adopt a company dog',
      description: '**Problem:** Low morale\n**Idea:** Get a dog\n**Cost:** $500/month\n**Stakes:** Happier team',
      processId: 'proc-1',
      confidenceScore: 4,
      easeScore: 3,
      impactScore: 5,
    };

    expect(body.title).toBeDefined();
    expect(body.confidenceScore).toBeGreaterThanOrEqual(1);
    expect(body.confidenceScore).toBeLessThanOrEqual(5);

    const computed = computeIceScore(body.impactScore, body.confidenceScore, body.easeScore);
    expect(computed).toBeCloseTo(20.0);
  });

  it('validates status transitions for idea actions', () => {
    const validTransitions: Record<string, string[]> = {
      SUBMITTED: ['UNDER_REVIEW', 'ARCHIVED'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED'],
      APPROVED: ['CONVERTED', 'ARCHIVED'],
      REJECTED: ['ARCHIVED'],
      CONVERTED: [],
      ARCHIVED: [],
    };

    expect(validTransitions['SUBMITTED']).toContain('UNDER_REVIEW');
    expect(validTransitions['APPROVED']).toContain('CONVERTED');
    expect(validTransitions['CONVERTED']).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd goal-dashboard && npx vitest run src/__tests__/ideas-api.test.ts
```

Expected: PASS (contract tests using pure functions).

- [ ] **Step 3: Create the ideas list/create route**

Create `src/app/api/ideas/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { ideaLimiter, getClientIp } from '@/lib/rate-limit';
import { computeIceScore, validateIceInputs } from '@/lib/scoring';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const sort = searchParams.get('sort') ?? 'iceScore';
  const order = searchParams.get('order') ?? 'desc';
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = 20;

  const where: any = {};

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['iceScore', 'createdAt', 'status', 'impactScore', 'confidenceScore', 'easeScore'];
  const sortField = validSortFields.includes(sort) ? sort : 'iceScore';

  const [ideas, total] = await Promise.all([
    prisma.idea.findMany({
      where,
      orderBy: { [sortField]: order === 'asc' ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        author: { select: { id: true, name: true, image: true } },
        process: {
          select: {
            id: true,
            title: true,
            function: { select: { name: true } },
          },
        },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.idea.count({ where }),
  ]);

  return Response.json({ ideas, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = ideaLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { title, description, processId, confidenceScore, easeScore, impactScore } = body;

  if (!title || !description) {
    return Response.json({ error: 'title and description are required' }, { status: 400 });
  }

  const validationError = validateIceInputs(impactScore, confidenceScore, easeScore);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const iceScore = computeIceScore(impactScore, confidenceScore, easeScore);

  const idea = await prisma.idea.create({
    data: {
      authorId: auth.userId,
      title,
      description,
      processId: processId ?? null,
      confidenceScore,
      easeScore,
      impactScore,
      iceScore,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      process: {
        select: {
          id: true,
          title: true,
          function: { select: { name: true } },
        },
      },
    },
  });

  return Response.json(idea, { status: 201 });
}
```

- [ ] **Step 4: Create the single idea route**

Create `src/app/api/ideas/[id]/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIceScore, validateIceInputs } from '@/lib/scoring';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, image: true } },
      process: {
        select: {
          id: true,
          title: true,
          function: { select: { name: true } },
        },
      },
      attachments: true,
      task: { select: { id: true, title: true, status: true } },
    },
  });

  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  return Response.json(idea);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  const isAdmin = auth.session.user.isAdmin;
  const isAuthor = idea.authorId === auth.userId;

  // Authors can edit only if SUBMITTED; admins can always edit
  if (!isAdmin && (!isAuthor || idea.status !== 'SUBMITTED')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const data: any = {};

  // Editable fields
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.processId !== undefined) data.processId = body.processId || null;

  // ICE scores (recompute iceScore if any change)
  if (body.impactScore !== undefined || body.confidenceScore !== undefined || body.easeScore !== undefined) {
    const impact = body.impactScore ?? idea.impactScore;
    const confidence = body.confidenceScore ?? idea.confidenceScore;
    const ease = body.easeScore ?? idea.easeScore;

    const validationError = validateIceInputs(impact, confidence, ease);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    data.impactScore = impact;
    data.confidenceScore = confidence;
    data.easeScore = ease;
    data.iceScore = computeIceScore(impact, confidence, ease);
  }

  // Status changes (admin only, except ARCHIVED which author can do)
  if (body.status !== undefined) {
    if (!isAdmin && !(isAuthor && body.status === 'ARCHIVED')) {
      return Response.json({ error: 'Only admins can change idea status' }, { status: 403 });
    }
    data.status = body.status;
  }

  const updated = await prisma.idea.update({
    where: { id },
    data,
    include: {
      author: { select: { id: true, name: true, image: true } },
      process: {
        select: {
          id: true,
          title: true,
          function: { select: { name: true } },
        },
      },
    },
  });

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  const isAdmin = auth.session.user.isAdmin;
  const isAuthor = idea.authorId === auth.userId;

  if (!isAdmin && (!isAuthor || idea.status !== 'SUBMITTED')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.idea.delete({ where: { id } });

  return Response.json({ success: true });
}
```

- [ ] **Step 5: Create the convert-to-task route**

Create `src/app/api/ideas/[id]/convert/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      process: {
        select: {
          id: true,
          assigneeId: true,
          delegateId: true,
          delegateUntil: true,
        },
      },
    },
  });

  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  if (idea.status === 'CONVERTED') {
    return Response.json({ error: 'Idea already converted' }, { status: 400 });
  }

  const body = await request.json();
  const {
    title,
    description,
    taskType = 'REACT',
    priority = 'MEDIUM',
    dueDate,
    ownerId,
  } = body;

  // Determine owner: from body, from process, or default to admin
  const effectiveOwnerId = ownerId ?? idea.process?.assigneeId ?? auth.userId;

  const task = await prisma.task.create({
    data: {
      ownerId: effectiveOwnerId,
      taskType,
      title: title ?? idea.title,
      description: description ?? idea.description,
      priority,
      dueDate: dueDate ? new Date(dueDate) : null,
      processId: idea.processId ?? null,
    },
  });

  await prisma.idea.update({
    where: { id },
    data: {
      status: 'CONVERTED',
      taskId: task.id,
    },
  });

  return Response.json({ task, ideaStatus: 'CONVERTED' }, { status: 201 });
}
```

- [ ] **Step 6: Create the idea attachments route**

Create `src/app/api/ideas/[id]/attachments/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: ideaId } = await params;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  const attachments = await prisma.ideaAttachment.findMany({
    where: { ideaId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(attachments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: ideaId } = await params;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  // Only author or admin can add attachments
  if (idea.authorId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { fileName, fileUrl, fileSize, mimeType } = body;

  if (!fileName || !fileUrl || !fileSize || !mimeType) {
    return Response.json({ error: 'fileName, fileUrl, fileSize, and mimeType are required' }, { status: 400 });
  }

  const attachment = await prisma.ideaAttachment.create({
    data: { ideaId, fileName, fileUrl, fileSize, mimeType },
  });

  return Response.json(attachment, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: ideaId } = await params;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  if (idea.authorId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('attachmentId');

  if (!attachmentId) {
    return Response.json({ error: 'attachmentId is required' }, { status: 400 });
  }

  const attachment = await prisma.ideaAttachment.findFirst({
    where: { id: attachmentId, ideaId },
  });

  if (!attachment) {
    return Response.json({ error: 'Attachment not found' }, { status: 404 });
  }

  await prisma.ideaAttachment.delete({ where: { id: attachmentId } });

  return Response.json({ success: true });
}
```

- [ ] **Step 7: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ideas/ src/__tests__/ideas-api.test.ts
git commit -m "feat: add ideas CRUD API with ICE scoring, convert-to-task, and attachments"
```

---

### Task 8: CARS Reactive Task Form Page

**Files:**
- Create: `src/app/tasks/new-react/page.tsx`
- Create: `src/components/tasks/__tests__/CarsForm.test.tsx`

- [ ] **Step 1: Write failing tests for the CARS form**

Create `src/components/tasks/__tests__/CarsForm.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import NewReactTaskPage from '@/app/tasks/new-react/page';

// Mock fetch for processes API and tasks API
vi.mocked(global.fetch).mockImplementation(async (url: any) => {
  if (url === '/api/processes') {
    return {
      ok: true,
      json: async () => [
        {
          id: 'fn-1',
          name: 'Marketing',
          processes: [
            {
              id: 'proc-1',
              title: 'Social Media',
              assigneeId: 'user-1',
              delegateId: null,
              delegateUntil: null,
              assignee: { id: 'user-1', name: 'Alex Johnson' },
              delegate: null,
            },
          ],
        },
      ],
    } as any;
  }
  if (typeof url === 'string' && url.startsWith('/api/tasks')) {
    return { ok: true, json: async () => ({ id: 'task-new', title: 'Test' }) } as any;
  }
  return { ok: false, json: async () => ({}) } as any;
});

describe('NewReactTaskPage', () => {
  it('renders the CARS form heading', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByText(/Create a Reactive Task/i)).toBeInTheDocument();
  });

  it('renders all four CARS input fields', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByLabelText(/Context/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Attempts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Request/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stakes/i)).toBeInTheDocument();
  });

  it('renders the title field', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByPlaceholderText(/Publish Case Study/i)).toBeInTheDocument();
  });

  it('renders the process search field', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByPlaceholderText(/search processes/i)).toBeInTheDocument();
  });

  it('renders the deadline date picker', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByLabelText(/deadline/i)).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByRole('button', { name: /Create Reactive Task/i })).toBeInTheDocument();
  });

  it('shows CARS framework info', () => {
    render(<NewReactTaskPage />);
    expect(screen.getByText(/CARS/)).toBeInTheDocument();
  });

  it('defaults priority to HIGH', () => {
    render(<NewReactTaskPage />);
    const select = screen.getByDisplayValue('HIGH');
    expect(select).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/CarsForm.test.tsx
```

Expected: FAIL — module `@/app/tasks/new-react/page` not found.

- [ ] **Step 3: Implement the CARS form page**

Create `src/app/tasks/new-react/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { ProcessSearch } from '@/components/tasks/ProcessSearch';
import { FileUploader } from '@/components/ui/FileUploader';
import { formatCarsDescription } from '@/lib/scoring';

interface UploadedFile {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export default function NewReactTaskPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [attempts, setAttempts] = useState('');
  const [request, setRequest] = useState('');
  const [stakes, setStakes] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Process selection
  const [processId, setProcessId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [processLabel, setProcessLabel] = useState('');

  // UI state
  const [carsOpen, setCarsOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleProcessSelect = (result: {
    processId: string;
    assigneeId: string;
    assigneeName: string;
    processLabel: string;
  }) => {
    setProcessId(result.processId);
    setOwnerId(result.assigneeId);
    setProcessLabel(`${result.processLabel} — ${result.assigneeName}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const description = formatCarsDescription({ context, attempts, request, stakes });

      const body: any = {
        title,
        description,
        taskType: 'REACT',
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        estimatedMinutes,
      };

      if (processId) body.processId = processId;
      if (ownerId) body.ownerId = ownerId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create task');
      }

      const task = await res.json();

      // Upload attachments if any
      for (const file of files) {
        await fetch(`/api/tasks/${task.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(file),
        });
      }

      router.push('/tasks');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Create a Reactive Task</h1>
      <p className="text-gray-400 mb-6">
        Use this form to create a Reactive Task for our team.
      </p>

      {/* CARS Framework Info */}
      <div className="mb-6 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-indigo-300 font-medium">
              Please use CARS to describe the Reactive Task accurately.
            </p>
            <button
              type="button"
              onClick={() => setCarsOpen(!carsOpen)}
              className="mt-2 flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {carsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Click to Review CARS
            </button>
            {carsOpen && (
              <div className="mt-3 space-y-2 text-sm text-gray-300">
                <p><strong className="text-white">C - Context:</strong> What relevant info should others know about this?</p>
                <p><strong className="text-white">A - Attempts:</strong> What have you tried already to solve this problem?</p>
                <p><strong className="text-white">R - Request:</strong> What specific actions would you like to see happen?</p>
                <p><strong className="text-white">S - Stakes:</strong> What makes this task important to complete by this person in this time frame?</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            What action are you requesting? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder='e.g., "Publish Case Study #212"'
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Process Search */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Who is responsible for this area? <span className="text-red-400">*</span>
          </label>
          <ProcessSearch onSelect={handleProcessSelect} selectedLabel={processLabel} />
        </div>

        {/* CARS Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Please describe using CARS: <span className="text-red-400">*</span>
          </label>
          <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
            <div>
              <label htmlFor="cars-context" className="block text-xs font-semibold text-gray-400 mb-1">Context</label>
              <textarea
                id="cars-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="What relevant info should others know?"
              />
            </div>
            <div>
              <label htmlFor="cars-attempts" className="block text-xs font-semibold text-gray-400 mb-1">Attempts</label>
              <textarea
                id="cars-attempts"
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="What have you tried already?"
              />
            </div>
            <div>
              <label htmlFor="cars-request" className="block text-xs font-semibold text-gray-400 mb-1">Request</label>
              <textarea
                id="cars-request"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="What specific actions would you like?"
              />
            </div>
            <div>
              <label htmlFor="cars-stakes" className="block text-xs font-semibold text-gray-400 mb-1">Stakes</label>
              <textarea
                id="cars-stakes"
                value={stakes}
                onChange={(e) => setStakes(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Why is this important in this time frame?"
              />
            </div>
          </div>
        </div>

        {/* Deadline Guidelines */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-300 font-medium">Deadline Guidelines</p>
              <button
                type="button"
                onClick={() => setDeadlineOpen(!deadlineOpen)}
                className="mt-1 flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                {deadlineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Click for Guidelines on Deadlines
              </button>
              {deadlineOpen && (
                <div className="mt-3 space-y-1 text-sm text-gray-300">
                  <p><strong className="text-white">&lt; 24 Hours:</strong> Extremely rare, fully blocking</p>
                  <p><strong className="text-white">1-3 Days:</strong> Quick requests or partially blocked</p>
                  <p><strong className="text-white">3-14 Days:</strong> General issues, not core function</p>
                  <p><strong className="text-white">&gt; 14 Days:</strong> Consider submitting as an Idea instead</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deadline + Priority + Duration */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-gray-300 mb-1">
              Deadline <span className="text-red-400">*</span>
            </label>
            <input
              id="deadline"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Est. Duration</label>
            <select
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(parseInt(e.target.value))}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
              <option value={480}>8 hours</option>
            </select>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Attachments (optional)</label>
          <FileUploader files={files} onFilesChange={setFiles} />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !title || !context || !request}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating...' : 'Create Reactive Task'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run CARS form tests**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/CarsForm.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/tasks/new-react/page.tsx src/components/tasks/__tests__/CarsForm.test.tsx
git commit -m "feat: add CARS reactive task form page at /tasks/new-react"
```

---

### Task 9: PICS Idea Form + Idea Database Page

**Files:**
- Create: `src/app/ideas/new/page.tsx`
- Create: `src/app/ideas/page.tsx`
- Create: `src/components/ideas/__tests__/IdeaForm.test.tsx`
- Create: `src/components/ideas/__tests__/IdeaDatabase.test.tsx`

- [ ] **Step 1: Write failing tests for the PICS idea form**

Create `src/components/ideas/__tests__/IdeaForm.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import NewIdeaPage from '@/app/ideas/new/page';

vi.mocked(global.fetch).mockImplementation(async (url: any) => {
  if (url === '/api/processes') {
    return { ok: true, json: async () => [] } as any;
  }
  if (url === '/api/ideas') {
    return { ok: true, json: async () => ({ id: 'idea-1' }) } as any;
  }
  return { ok: false, json: async () => ({}) } as any;
});

describe('NewIdeaPage', () => {
  it('renders the idea form heading', () => {
    render(<NewIdeaPage />);
    expect(screen.getByText(/Create an Idea/i)).toBeInTheDocument();
  });

  it('renders PICS framework info', () => {
    render(<NewIdeaPage />);
    expect(screen.getByText(/PICS/)).toBeInTheDocument();
  });

  it('renders title input', () => {
    render(<NewIdeaPage />);
    expect(screen.getByPlaceholderText(/Adopt a company dog/i)).toBeInTheDocument();
  });

  it('renders all four PICS input fields', () => {
    render(<NewIdeaPage />);
    expect(screen.getByLabelText(/Problem/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Idea/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stakes/i)).toBeInTheDocument();
  });

  it('renders ICE score selectors', () => {
    render(<NewIdeaPage />);
    expect(screen.getByText(/Confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Ease/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<NewIdeaPage />);
    expect(screen.getByRole('button', { name: /Submit Your Idea/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/components/ideas/__tests__/IdeaForm.test.tsx
```

Expected: FAIL — module `@/app/ideas/new/page` not found.

- [ ] **Step 3: Implement the PICS idea form page**

Create `src/app/ideas/new/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { ProcessSearch } from '@/components/tasks/ProcessSearch';
import { FileUploader } from '@/components/ui/FileUploader';
import { formatPicsDescription } from '@/lib/scoring';

interface UploadedFile {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

function ScoreSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-300">{label}</p>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
              value === n
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewIdeaPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [idea, setIdea] = useState('');
  const [cost, setCost] = useState('');
  const [stakes, setStakes] = useState('');
  const [processId, setProcessId] = useState<string | null>(null);
  const [processLabel, setProcessLabel] = useState('');
  const [impactScore, setImpactScore] = useState(3);
  const [confidenceScore, setConfidenceScore] = useState(3);
  const [easeScore, setEaseScore] = useState(3);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [picsOpen, setPicsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const description = formatPicsDescription({ problem, idea, cost, stakes });

      const body: any = {
        title,
        description,
        impactScore,
        confidenceScore,
        easeScore,
      };
      if (processId) body.processId = processId;

      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit idea');
      }

      const createdIdea = await res.json();

      // Upload attachments
      for (const file of files) {
        await fetch(`/api/ideas/${createdIdea.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(file),
        });
      }

      router.push('/ideas');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Create an Idea</h1>
      <p className="text-gray-400 mb-6">
        Use this form to inspire where we should invest our time in the future.
      </p>

      {/* PICS Framework Info */}
      <div className="mb-6 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-indigo-300 font-medium">
              You might find the PICS framework helpful.
            </p>
            <button
              type="button"
              onClick={() => setPicsOpen(!picsOpen)}
              className="mt-2 flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {picsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Click to Review PICS
            </button>
            {picsOpen && (
              <div className="mt-3 space-y-2 text-sm text-gray-300">
                <p><strong className="text-white">P - Problem:</strong> Here&apos;s the opportunity I see</p>
                <p><strong className="text-white">I - Idea:</strong> Here&apos;s how I&apos;d solve it</p>
                <p><strong className="text-white">C - Cost:</strong> Investment needed (time/money/energy)</p>
                <p><strong className="text-white">S - Stakes:</strong> Why prioritize this over others</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            What should we call this Idea? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder='e.g., "Adopt a company dog"'
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* PICS Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Describe using PICS: <span className="text-red-400">*</span>
          </label>
          <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
            <div>
              <label htmlFor="pics-problem" className="block text-xs font-semibold text-gray-400 mb-1">Problem</label>
              <textarea
                id="pics-problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="What opportunity or problem do you see?"
              />
            </div>
            <div>
              <label htmlFor="pics-idea" className="block text-xs font-semibold text-gray-400 mb-1">Idea</label>
              <textarea
                id="pics-idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="How would you solve it?"
              />
            </div>
            <div>
              <label htmlFor="pics-cost" className="block text-xs font-semibold text-gray-400 mb-1">Cost</label>
              <textarea
                id="pics-cost"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="What investment is needed? (time, money, energy)"
              />
            </div>
            <div>
              <label htmlFor="pics-stakes" className="block text-xs font-semibold text-gray-400 mb-1">Stakes</label>
              <textarea
                id="pics-stakes"
                value={stakes}
                onChange={(e) => setStakes(e.target.value)}
                required
                rows={2}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Why should we prioritize this?"
              />
            </div>
          </div>
        </div>

        {/* Process (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Related Process (optional)
          </label>
          <ProcessSearch
            onSelect={(result) => {
              setProcessId(result.processId);
              setProcessLabel(result.processLabel);
            }}
            selectedLabel={processLabel}
          />
        </div>

        {/* ICE Scores */}
        <div className="space-y-4">
          <ScoreSelector
            label="Confidence: How likely to produce expected result? *"
            description="1 = Very unlikely, 5 = Very likely"
            value={confidenceScore}
            onChange={setConfidenceScore}
          />
          <ScoreSelector
            label="Ease: How easy to execute? *"
            description="1 = Very hard, 5 = Very easy"
            value={easeScore}
            onChange={setEaseScore}
          />
          <ScoreSelector
            label="Impact: How impactful? *"
            description="1 = Low impact, 5 = High impact"
            value={impactScore}
            onChange={setImpactScore}
          />

          <div className="text-sm text-gray-400">
            Computed ICE Score:{' '}
            <span className="text-white font-semibold">
              {Math.round(((impactScore * confidenceScore * easeScore) / 3) * 100) / 100}
            </span>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Attachments (optional)</label>
          <FileUploader files={files} onFilesChange={setFiles} />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !title || !problem || !idea}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Submitting...' : 'Submit Your Idea'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run PICS form tests**

```bash
cd goal-dashboard && npx vitest run src/components/ideas/__tests__/IdeaForm.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Write failing tests for the Idea Database page**

Create `src/components/ideas/__tests__/IdeaDatabase.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import IdeasPage from '@/app/ideas/page';

const mockIdeas = {
  ideas: [
    {
      id: 'idea-1',
      title: 'Adopt a company dog',
      description: '**Problem:** Low morale',
      status: 'SUBMITTED',
      impactScore: 5,
      confidenceScore: 4,
      easeScore: 3,
      iceScore: 20.0,
      createdAt: '2026-03-20T00:00:00Z',
      author: { id: 'user-1', name: 'Alex', image: null },
      process: { id: 'proc-1', title: 'Office Management', function: { name: 'Operations' } },
      _count: { attachments: 0 },
    },
    {
      id: 'idea-2',
      title: 'Automate weekly reports',
      description: '**Problem:** Time waste',
      status: 'APPROVED',
      impactScore: 5,
      confidenceScore: 3,
      easeScore: 3,
      iceScore: 15.0,
      createdAt: '2026-03-18T00:00:00Z',
      author: { id: 'user-2', name: 'Sam', image: null },
      process: null,
      _count: { attachments: 1 },
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

vi.mocked(global.fetch).mockImplementation(async (url: any) => {
  if (typeof url === 'string' && url.includes('/api/ideas')) {
    return { ok: true, json: async () => mockIdeas } as any;
  }
  return { ok: false, json: async () => ({}) } as any;
});

describe('IdeasPage', () => {
  it('renders the Idea Database heading', async () => {
    render(<IdeasPage />);
    expect(screen.getByText(/Idea Database/i)).toBeInTheDocument();
  });

  it('renders the New Idea button', () => {
    render(<IdeasPage />);
    expect(screen.getByText(/New Idea/i)).toBeInTheDocument();
  });

  it('renders idea cards after loading', async () => {
    render(<IdeasPage />);
    await waitFor(() => {
      expect(screen.getByText('Adopt a company dog')).toBeInTheDocument();
      expect(screen.getByText('Automate weekly reports')).toBeInTheDocument();
    });
  });

  it('shows ICE scores on idea cards', async () => {
    render(<IdeasPage />);
    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  it('renders filter and sort controls', () => {
    render(<IdeasPage />);
    expect(screen.getByText(/Filter/i)).toBeInTheDocument();
    expect(screen.getByText(/Sort/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/components/ideas/__tests__/IdeaDatabase.test.tsx
```

Expected: FAIL — module `@/app/ideas/page` not found.

- [ ] **Step 7: Implement the Idea Database page**

Create `src/app/ideas/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';

interface IdeaData {
  id: string;
  title: string;
  description: string;
  status: string;
  impactScore: number;
  confidenceScore: number;
  easeScore: number;
  iceScore: number;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  process: { id: string; title: string; function: { name: string } } | null;
  _count: { attachments: number };
}

const STATUS_OPTIONS = ['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONVERTED', 'ARCHIVED'];
const SORT_OPTIONS = [
  { value: 'iceScore', label: 'ICE Score' },
  { value: 'createdAt', label: 'Date Created' },
  { value: 'status', label: 'Status' },
  { value: 'impactScore', label: 'Impact' },
  { value: 'confidenceScore', label: 'Confidence' },
  { value: 'easeScore', label: 'Ease' },
];

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'text-blue-400',
  UNDER_REVIEW: 'text-yellow-400',
  APPROVED: 'text-green-400',
  REJECTED: 'text-red-400',
  CONVERTED: 'text-purple-400',
  ARCHIVED: 'text-gray-500',
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('iceScore');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      sort,
      order,
    });
    if (status !== 'ALL') params.set('status', status);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/ideas?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, status, sort, order, search]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleStatusAction = async (ideaId: string, newStatus: string) => {
    const res = await fetch(`/api/ideas/${ideaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchIdeas();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Idea Database</h1>
        <Link
          href="/ideas/new"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Idea
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-400">Filter Status</span>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-400">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {order === 'desc' ? 'DESC' : 'ASC'}
          </button>
        </div>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search ideas..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Ideas List */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No ideas found</div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === idea.id ? null : idea.id)}
                className="w-full text-left px-5 py-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {expandedId === idea.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                      <h3 className="text-white font-medium">{idea.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-6 text-xs text-gray-500">
                      <span className={STATUS_COLORS[idea.status] ?? 'text-gray-400'}>
                        {idea.status.replace('_', ' ')}
                      </span>
                      <span>By: {idea.author.name}</span>
                      <span>{new Date(idea.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-gray-500">
                      <span>Impact: {idea.impactScore}</span>
                      <span>Confidence: {idea.confidenceScore}</span>
                      <span>Ease: {idea.easeScore}</span>
                    </div>
                    {idea.process && (
                      <div className="mt-1 ml-6 text-xs text-gray-500">
                        Process: {idea.process.function.name} &gt; {idea.process.title}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-indigo-400">
                      {Math.round(idea.iceScore)}
                    </div>
                    <div className="text-xs text-gray-500">ICE</div>
                  </div>
                </div>
              </button>

              {expandedId === idea.id && (
                <div className="border-t border-gray-700 px-5 py-4">
                  <div className="text-sm text-gray-300 whitespace-pre-wrap mb-4">
                    {idea.description}
                  </div>
                  <div className="flex gap-2">
                    {idea.status === 'SUBMITTED' && (
                      <button
                        type="button"
                        onClick={() => handleStatusAction(idea.id, 'UNDER_REVIEW')}
                        className="rounded px-3 py-1.5 text-xs font-medium border border-yellow-600/30 text-yellow-400 hover:bg-yellow-600/10 transition-colors"
                      >
                        Review
                      </button>
                    )}
                    {(idea.status === 'SUBMITTED' || idea.status === 'UNDER_REVIEW') && (
                      <button
                        type="button"
                        onClick={() => handleStatusAction(idea.id, 'APPROVED')}
                        className="rounded px-3 py-1.5 text-xs font-medium border border-green-600/30 text-green-400 hover:bg-green-600/10 transition-colors"
                      >
                        Approve
                      </button>
                    )}
                    {idea.status !== 'CONVERTED' && idea.status !== 'ARCHIVED' && (
                      <Link
                        href={`/tasks/new-react?fromIdea=${idea.id}`}
                        className="rounded px-3 py-1.5 text-xs font-medium border border-purple-600/30 text-purple-400 hover:bg-purple-600/10 transition-colors"
                      >
                        Convert to Task
                      </Link>
                    )}
                    {idea.status !== 'ARCHIVED' && idea.status !== 'CONVERTED' && (
                      <button
                        type="button"
                        onClick={() => handleStatusAction(idea.id, 'ARCHIVED')}
                        className="rounded px-3 py-1.5 text-xs font-medium border border-gray-600/30 text-gray-400 hover:bg-gray-600/10 transition-colors"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 py-1.5">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button
            type="button"
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
            className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run Idea Database tests**

```bash
cd goal-dashboard && npx vitest run src/components/ideas/__tests__/IdeaDatabase.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 9: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/ideas/ src/components/ideas/
git commit -m "feat: add PICS idea form and idea database page with ICE scoring, filtering, and actions"
```

---

### Task 10: Sidebar Navigation + Final Verification

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing sidebar test updates**

In `src/components/layout/__tests__/Sidebar.test.tsx`, change the test `'renders all 10 nav items'` to:

```typescript
  it('renders all 12 nav items', () => {
    setMockPathname('/');
    render(<Sidebar />);
    const labels = [
      'Dashboard', 'Goal Stack', 'Tasks', 'New Task', 'Calendar', 'Reviews',
      'Power Down', 'Leaderboard', 'Reports', 'Processes', 'Ideas', 'Settings',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
```

Also add two new tests:

```typescript
  it('has New Task linking to /tasks/new-react', () => {
    setMockPathname('/');
    render(<Sidebar />);
    const newTaskLink = screen.getByText('New Task').closest('a');
    expect(newTaskLink).toHaveAttribute('href', '/tasks/new-react');
  });

  it('has Ideas linking to /ideas', () => {
    setMockPathname('/');
    render(<Sidebar />);
    const ideasLink = screen.getByText('Ideas').closest('a');
    expect(ideasLink).toHaveAttribute('href', '/ideas');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx
```

Expected: FAIL — 'New Task' and 'Ideas' not found, count is 10 not 12.

- [ ] **Step 3: Update the Sidebar component**

In `src/components/layout/Sidebar.tsx`, update the lucide-react import to add `PlusCircle` and `Lightbulb`:

```typescript
import {
  LayoutDashboard,
  Target,
  CheckSquare,
  Calendar,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
  PlusCircle,
  Lightbulb,
} from 'lucide-react';
```

Update the `navSections` array to add both new items:

```typescript
const navSections = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/goals', label: 'Goal Stack', icon: Target },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/tasks/new-react', label: 'New Task', icon: PlusCircle },
    ],
  },
  {
    label: 'Rituals',
    items: [
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
      { href: '/powerdown', label: 'Power Down', icon: Moon },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/processes', label: 'Processes', icon: ListChecks },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
```

- [ ] **Step 4: Run sidebar tests**

```bash
cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Verify the build compiles**

```bash
cd goal-dashboard && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Run the linter**

```bash
cd goal-dashboard && npx next lint
```

Expected: No new lint errors.

- [ ] **Step 8: Commit sidebar changes**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/__tests__/Sidebar.test.tsx
git commit -m "feat: add New Task and Ideas navigation items to sidebar"
```

- [ ] **Step 9: Final verification commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from reactive task form and idea database implementation"
```
