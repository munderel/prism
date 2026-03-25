# Process Task Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `defaultDurationMinutes` field to the Process model so that the cron job copies it into each generated task's `estimatedMinutes`, and expose a duration picker in the process editor UI.

**Architecture:** Three layers: (1) Prisma schema migration adding `defaultDurationMinutes` to Process, (2) cron job update to pass duration into task creation, (3) process editor UI + API accepting the new field on create/edit.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / lucide-react

**Dependency:** This plan assumes `estimatedMinutes Int @default(60)` exists on the Task model (from the dashboard-calendar-fixes plan). If that migration has not yet run, run it first.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `defaultDurationMinutes Int @default(60)` to Process model |
| `src/app/api/cron/process-tasks/route.ts` | Modify | Pass `estimatedMinutes: process.defaultDurationMinutes` into task creation |
| `src/__tests__/process-task-cron.test.ts` | Create | Unit tests for cron job duration propagation |
| `src/app/api/processes/functions/[id]/route.ts` | Modify | Accept `defaultDurationMinutes` in POST (process creation) |
| `src/app/api/processes/[id]/route.ts` | Modify | Accept `defaultDurationMinutes` in PATCH (process edit, admin path) |
| `src/app/(app)/processes/page.tsx` | Modify | Add duration picker to create and edit process forms |

---

### Task 1: Prisma Schema — Add defaultDurationMinutes to Process Model

**Files:**
- Modify: `prisma/schema.prisma` (Process model)

- [ ] **Step 1: Add defaultDurationMinutes field to Process model**

In `prisma/schema.prisma`, add after `cadenceRule String?` (line 416):

```prisma
  defaultDurationMinutes  Int             @default(60)
```

- [ ] **Step 2: Run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name add_default_duration_minutes_to_process`
Expected: Migration creates successfully. Existing processes get default value of 60.

- [ ] **Step 3: Verify Prisma client generation**

Run: `cd goal-dashboard && npx prisma generate`
Expected: Client regenerates with `defaultDurationMinutes` on Process type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add defaultDurationMinutes to Process model"
```

---

### Task 2: Cron Job — Pass Duration to Generated Tasks

**Files:**
- Modify: `src/app/api/cron/process-tasks/route.ts`
- Create: `src/__tests__/process-task-cron.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/process-task-cron.test.ts` with tests for:
- Process with `defaultDurationMinutes: 30` generates a task with `estimatedMinutes: 30`
- Process with default (60) generates a task with `estimatedMinutes: 60`
- Process with no responsible user is skipped (existing behavior preserved)

Mock `prisma.process.findMany`, `prisma.$transaction`, and `requireCronSecret`. Verify the `task.create` call inside the transaction includes `estimatedMinutes` matching the process value.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockFindMany = vi.fn();
const mockTaskCreate = vi.fn();
const mockExecutionCreate = vi.fn();
const mockProcessUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    process: { findMany: mockFindMany },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireCronSecret: () => true,
}));

vi.mock('@/lib/process-scheduler', () => ({
  computeNextDueDate: () => new Date('2026-03-25'),
}));

describe('Process task cron — duration propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates task with estimatedMinutes from process.defaultDurationMinutes', async () => {
    mockFindMany.mockResolvedValue([{
      id: 'proc-1',
      title: 'Weekly Report',
      description: null,
      cadence: 'WEEKLY',
      defaultDurationMinutes: 30,
      assigneeId: 'user-1',
      delegateId: null,
      delegateUntil: null,
    }]);

    mockTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        task: { create: mockTaskCreate.mockResolvedValue({ id: 'task-1' }) },
        processExecution: { create: mockExecutionCreate.mockResolvedValue({ id: 'exec-1' }) },
        process: { update: mockProcessUpdate.mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const { GET } = await import('@/app/api/cron/process-tasks/route');
    const request = new Request('http://localhost/api/cron/process-tasks');
    await GET(request as any);

    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimatedMinutes: 30,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/process-task-cron.test.ts`
Expected: FAIL — `estimatedMinutes` not present in task create data.

- [ ] **Step 3: Add estimatedMinutes to task creation in cron**

In `src/app/api/cron/process-tasks/route.ts`, update the `tx.task.create` call (line 48-57) to include `estimatedMinutes`:

```typescript
const task = await tx.task.create({
  data: {
    ownerId: responsibleUserId!,
    taskType: 'MAINTENANCE',
    title: process.title,
    description: process.description,
    dueDate: computeNextDueDate(process.cadence, now),
    status: 'TODO',
    priority: 'MEDIUM',
    estimatedMinutes: process.defaultDurationMinutes,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/process-task-cron.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/process-tasks/route.ts src/__tests__/process-task-cron.test.ts
git commit -m "feat(cron): propagate defaultDurationMinutes to generated task estimatedMinutes"
```

---

### Task 3: Process API — Accept defaultDurationMinutes in Create and Edit

**Files:**
- Modify: `src/app/api/processes/functions/[id]/route.ts` (POST — create process)
- Modify: `src/app/api/processes/[id]/route.ts` (PATCH — edit process)

- [ ] **Step 1: Add defaultDurationMinutes to process creation POST handler**

In `src/app/api/processes/functions/[id]/route.ts`, update line 14 to destructure `defaultDurationMinutes`:

```typescript
const { title, description, cadence, assigneeId, defaultDurationMinutes } = body;
```

Add validation after the title check:

```typescript
if (defaultDurationMinutes !== undefined && (typeof defaultDurationMinutes !== 'number' || defaultDurationMinutes <= 0)) {
  return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
}
```

Add to the `prisma.process.create` data object:

```typescript
...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
```

- [ ] **Step 2: Add defaultDurationMinutes to process edit PATCH handler**

In `src/app/api/processes/[id]/route.ts`, update line 57 (admin destructuring) to include `defaultDurationMinutes`:

```typescript
const { title, description, assigneeId, delegateId, delegateUntil, cadence, cadenceRule, defaultDurationMinutes } = body;
```

Add to the `prisma.process.update` data spread:

```typescript
...(defaultDurationMinutes !== undefined && (defaultDurationMinutes > 0 ? { defaultDurationMinutes } : {})),
```

- [ ] **Step 3: Run build to verify no type errors**

Run: `cd goal-dashboard && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/processes/functions/\[id\]/route.ts src/app/api/processes/\[id\]/route.ts
git commit -m "feat(api): accept defaultDurationMinutes in process create and edit endpoints"
```

---

### Task 4: Process Editor UI — Duration Picker

**Files:**
- Modify: `src/app/(app)/processes/page.tsx`

- [ ] **Step 1: Add duration state variables**

After existing state declarations (around line 89), add:

```typescript
const [newProcDuration, setNewProcDuration] = useState(60);
const [editProcDuration, setEditProcDuration] = useState(60);
```

Add a `DURATION_OPTIONS` constant near the top of the file (after `CADENCE_COLORS`):

```typescript
const DURATION_OPTIONS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];
```

Add `Clock` to the lucide-react imports.

- [ ] **Step 2: Update ProcessData interface**

Add to the `ProcessData` interface:

```typescript
defaultDurationMinutes: number;
```

- [ ] **Step 3: Wire duration into handleAddProcess**

In `handleAddProcess` (line 177), add `defaultDurationMinutes: newProcDuration` to the JSON body:

```typescript
body: JSON.stringify({
  title: newProcTitle.trim(),
  description: newProcDesc.trim() || null,
  cadence: newProcCadence,
  assigneeId: newProcAssignee || null,
  defaultDurationMinutes: newProcDuration,
}),
```

Reset `newProcDuration` to 60 in the success block alongside other resets.

- [ ] **Step 4: Wire duration into handleEditProcess**

In `handleEditProcess` (line 201), add `defaultDurationMinutes: editProcDuration` to the JSON body:

```typescript
body: JSON.stringify({
  title: editProcTitle,
  description: editProcDesc || null,
  cadence: editProcCadence,
  assigneeId: editProcAssignee || null,
  defaultDurationMinutes: editProcDuration,
}),
```

- [ ] **Step 5: Add duration select to "New Process" form**

In the add-process form (after the cadence/assignee `<div className="flex gap-2">` block around line 509-531), add a duration select inside the same flex container:

```tsx
<select
  value={newProcDuration}
  onChange={(e) => setNewProcDuration(Number(e.target.value))}
  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
>
  {DURATION_OPTIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

- [ ] **Step 6: Add duration select to "Edit Process" form**

In the edit-process form (after the cadence/assignee `<div className="flex gap-2">` block around line 631-653), add the same duration select using `editProcDuration`/`setEditProcDuration`.

Also update the edit-process button onClick handler (around line 590-597) to initialize `editProcDuration`:

```typescript
setEditProcDuration(proc.defaultDurationMinutes ?? 60);
```

- [ ] **Step 7: Show duration badge on process card**

In the process card header, alongside the cadence badge (around line 583-586), add a duration indicator:

```tsx
<span className="flex items-center gap-1 text-xs text-gray-500">
  <Clock className="h-3 w-3" />
  {DURATION_OPTIONS.find(o => o.value === proc.defaultDurationMinutes)?.label || `${proc.defaultDurationMinutes}m`}
</span>
```

- [ ] **Step 8: Run build**

Run: `cd goal-dashboard && npm run build`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/processes/page.tsx
git commit -m "feat(ui): add duration picker to process create and edit forms"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run full test suite**
- [ ] **Step 2: Run build**
- [ ] **Step 3: Manual smoke test** — create a process with duration=30m, edit it to 45m, trigger cron, verify generated task has correct estimatedMinutes
- [ ] **Step 4: Commit any fixes**
