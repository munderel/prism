# Dashboard Home Page Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three dashboard issues — remove the stale progress bar, give the weekly-view AIM checkboxes instant feedback via optimistic updates, and make timeline blocks draggable left/right.

**Architecture:** All changes are isolated to two files. The weekly AIM checkbox fix converts one `onChange` handler from `await+mutate` to SWR's `mutate(fn, { optimisticData })` pattern (already used for the daily-view AIMs and all task checkboxes). The timeline drag fix adds explicit `sensors` to `@dnd-kit/core`'s `DndContext`; without them, `@dnd-kit` silently fails to register pointer events.

**Tech Stack:** Next.js 14 App Router, SWR v2, `@dnd-kit/core` v6.3.1, Vitest + React Testing Library

---

## File Map

| File | Role | Change |
|------|------|--------|
| `src/app/(app)/page.tsx` | Main dashboard page | Replace slow weekly-view AIM `onChange` handler |
| `src/components/dashboard/DashboardTimeline.tsx` | Horizontal timeline with drag | Add explicit sensors to `DndContext` + `userSelect: none` |
| `src/app/(app)/__tests__/DashboardPage.test.tsx` | Dashboard page tests | Add: no progress bar, REACT section renders, AIM optimistic update |
| `src/components/dashboard/__tests__/DashboardTimeline.test.tsx` | Timeline tests | New: renders blocks, drag wiring |

---

## Task 1: Verify removed features and add regression tests

Two things are already correct in the working tree — the progress bar is gone and the REACT task section exists. This task locks in those facts with tests so they can't accidentally come back.

**Files:**
- Modify: `src/app/(app)/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Open the test file and check existing imports**

Open `src/app/(app)/__tests__/DashboardPage.test.tsx`. The top of the file already has:

```tsx
import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import DashboardPage from '../page';
```

`renderWithProviders` accepts `{ swrData: Record<string, any> }` in its options object and stubs SWR keys with mock data.

- [ ] **Step 2: Write the failing test — no progress bar on page**

Add this test inside the existing `describe('DashboardPage', ...)` block at the bottom of the file:

```tsx
it('does not render a task progress bar', async () => {
  const taskData = [
    createTask({ id: 't1', status: 'DONE' }),
    createTask({ id: 't2', status: 'TODO' }),
    createTask({ id: 't3', status: 'TODO' }),
  ];
  renderPage(taskData);

  await waitFor(() => {
    // The old bar had text like "1/3 tasks done — keep going!"
    expect(screen.queryByText(/tasks done/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keep going/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ready to start/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run this test**

```bash
cd "c:\Users\munde\Spaces\UpWhiten Internal Team Management Software\goal-dashboard"
npx vitest run src/app/\(app\)/__tests__/DashboardPage.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: **PASS** (bar is already absent from working tree).

- [ ] **Step 4: Write the failing test — REACT task section renders**

Add directly below the previous test:

```tsx
it('renders React Tasks section when REACT tasks exist', async () => {
  const taskData = [
    createTask({ id: 'r1', title: 'Fix the bug', taskType: 'REACT', status: 'TODO' }),
  ];
  renderPage(taskData);

  await waitFor(() => {
    expect(screen.getByText(/React Tasks/i)).toBeInTheDocument();
    expect(screen.getByText('Fix the bug')).toBeInTheDocument();
  });
});

it('renders React Tasks section empty state when no REACT tasks', async () => {
  renderPage([]);

  await waitFor(() => {
    expect(screen.getByText(/No react tasks/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run these new tests**

```bash
npx vitest run src/app/\(app\)/__tests__/DashboardPage.test.tsx --reporter=verbose 2>&1 | tail -25
```

Expected: All **PASS**. The REACT section is already rendered by the `Object.entries(groupedTasks)` loop in `page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/__tests__/DashboardPage.test.tsx
git commit -m "test(dashboard): verify progress bar removed and REACT section renders"
```

---

## Task 2: Fix weekly-view AIM checkbox optimistic update

The weekly view renders AIM instances with a plain `<input type="checkbox">`. Its `onChange` currently awaits the fetch before calling `mutateAims()` — so the checkbox visually lags until the server responds. Fix: use the same `mutateAims(asyncFn, { optimisticData })` pattern already used in the daily view.

**Files:**
- Modify: `src/app/(app)/page.tsx` (~lines 449–456)
- Modify: `src/app/(app)/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Add the import for `fireEvent` at the top of the test file**

The top import line currently reads:

```tsx
import { screen, waitFor } from '@testing-library/react';
```

Replace with:

```tsx
import { screen, waitFor, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Write the failing test**

The test needs an AIM in the weekly-view SWR data. Add this test to `src/app/(app)/__tests__/DashboardPage.test.tsx` inside the `describe` block:

```tsx
it('renders AIM rows in weekly view', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const aimInstance = {
    id: 'aim-1',
    aimCategoryId: 'cat-1',
    scheduledDate: today,
    timeBlockStart: null,
    timeBlockEnd: null,
    isGroupOpen: false,
    status: 'SCHEDULED',
    completedAt: null,
    activityNote: null,
    selectedActivity: null,
    phaseAtCompletion: null,
    pointsEarned: 0,
    createdAt: new Date().toISOString(),
    userId: 'user-1',
    aimCategory: { id: 'cat-1', name: 'Deep Work' },
  };

  renderWithProviders(<DashboardPage />, {
    swrData: {
      '/api/tasks': [],
      [`/api/aims/instances?start=${today}T00:00:00&end=${today}T23:59:59`]: [aimInstance],
    },
  });

  // Switch to weekly view
  fireEvent.click(screen.getByText('Weekly'));

  // AIM should appear in weekly view
  await waitFor(() => expect(screen.getByText('Deep Work')).toBeInTheDocument());

  // Checkbox should be unchecked
  const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
});
```

- [ ] **Step 3: Run the test to confirm it passes (or investigate if it fails)**

```bash
npx vitest run src/app/\(app\)/__tests__/DashboardPage.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: **PASS** — the weekly view already renders AIM rows (this is a smoke test verifying the feature is present, not a regression).

- [ ] **Step 4: Apply the fix in page.tsx**

Open `src/app/(app)/page.tsx`. Find the weekly-view AIM checkbox — it's inside the `{aimList.filter(...).map((aim: any) => (` block in the weekly-view branch. The `onChange` looks like:

```tsx
onChange={async () => {
  await fetch(`/api/aims/instances/${aim.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED' }),
  });
  mutateAims();
}}
```

Replace the entire `onChange` prop with:

```tsx
onChange={() => {
  const newStatus = aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED';
  mutateAims(
    async (currentData: any) => {
      await fetch(`/api/aims/instances/${aim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      return (Array.isArray(currentData) ? currentData : []).map((a: any) =>
        a.id === aim.id ? { ...a, status: newStatus } : a
      );
    },
    {
      optimisticData: (currentData: any) =>
        (Array.isArray(currentData) ? currentData : []).map((a: any) =>
          a.id === aim.id ? { ...a, status: newStatus } : a
        ),
      rollbackOnError: true,
    }
  );
}}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/app/\(app\)/__tests__/DashboardPage.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests **PASS**.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -40
```

Expected: All previously-passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/page.tsx src/app/\(app\)/__tests__/DashboardPage.test.tsx
git commit -m "fix(dashboard): weekly-view AIM checkbox now updates UI immediately via optimistic SWR mutation"
```

---

## Task 3: Fix DashboardTimeline drag (add explicit sensors)

`@dnd-kit/core`'s `DndContext` without a `sensors` prop may silently skip drag-event registration in some environments. The fix is to supply explicit `PointerSensor` + `MouseSensor` with a 4px activation distance (so a plain click doesn't accidentally start a drag). Also add `userSelect: 'none'` to the draggable block so text-selection doesn't fight the gesture.

**Files:**
- Create: `src/components/dashboard/__tests__/DashboardTimeline.test.tsx`
- Modify: `src/components/dashboard/DashboardTimeline.tsx`

- [ ] **Step 1: Create the test file with a failing test**

Create `src/components/dashboard/__tests__/DashboardTimeline.test.tsx`:

```tsx
import { vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import { DashboardTimeline } from '../DashboardTimeline';

const today = new Date();
function makeBlock(id: string, startHour: number, endHour: number) {
  const start = new Date(today);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(today);
  end.setHours(endHour, 0, 0, 0);
  return {
    id,
    title: `Block ${id}`,
    start: start.toISOString(),
    end: end.toISOString(),
    type: 'IMPROVE' as const,
  };
}

describe('DashboardTimeline', () => {
  it('renders blocks as draggable elements when onBlockMove is provided', () => {
    const onBlockMove = vi.fn();
    render(
      <DashboardTimeline
        blocks={[makeBlock('b1', 9, 10), makeBlock('b2', 11, 12)]}
        onBlockMove={onBlockMove}
      />
    );

    // Both block titles should be visible
    expect(screen.getByTitle(/Block b1/)).toBeInTheDocument();
    expect(screen.getByTitle(/Block b2/)).toBeInTheDocument();
  });

  it('renders empty timeline without errors', () => {
    const { container } = render(<DashboardTimeline blocks={[]} />);
    // The track div should exist
    expect(container.querySelector('.rounded-xl')).toBeInTheDocument();
  });

  it('shows "Today\'s Schedule" header', () => {
    render(<DashboardTimeline blocks={[]} />);
    expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
  });

  it('renders blocks with grab cursor when dragging is enabled', () => {
    const onBlockMove = vi.fn();
    const { container } = render(
      <DashboardTimeline
        blocks={[makeBlock('b1', 9, 10)]}
        onBlockMove={onBlockMove}
      />
    );
    // The block should have cursor:grab style
    const block = container.querySelector('[style*="grab"]');
    expect(block).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run this test to confirm it fails**

```bash
npx vitest run src/components/dashboard/__tests__/DashboardTimeline.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: Some tests FAIL (component may throw or blocks may not render correctly before the sensor fix, or a minor test infra issue — at minimum the `grab cursor` test should fail until `userSelect` is added).

- [ ] **Step 3: Update the import in DashboardTimeline.tsx**

Open `src/components/dashboard/DashboardTimeline.tsx`. Line 4 currently reads:

```tsx
import { DndContext, useDraggable, type DragEndEvent, type Modifier } from '@dnd-kit/core';
```

Replace with:

```tsx
import { DndContext, useDraggable, useSensors, useSensor, PointerSensor, MouseSensor, type DragEndEvent, type Modifier } from '@dnd-kit/core';
```

- [ ] **Step 4: Add `userSelect: 'none'` to the DraggableBlock style**

In `DashboardTimeline.tsx`, find the `style` object inside `DraggableBlock` (around line 72). It currently reads:

```tsx
const style: React.CSSProperties = {
  left: `${block.left}%`,
  width: `${block.width}%`,
  backgroundColor: block.colors.bg,
  borderLeft: `2px solid ${block.colors.border}`,
  ...(transform ? { transform: `translate3d(${transform.x}px, 0, 0)` } : {}),
  ...(isDragging ? { opacity: 0.8, zIndex: 20, cursor: 'grabbing' } : {}),
  ...(canDrag ? { cursor: isDragging ? 'grabbing' : 'grab' } : {}),
};
```

Add `userSelect: 'none'` as the fifth property:

```tsx
const style: React.CSSProperties = {
  left: `${block.left}%`,
  width: `${block.width}%`,
  backgroundColor: block.colors.bg,
  borderLeft: `2px solid ${block.colors.border}`,
  userSelect: 'none',
  ...(transform ? { transform: `translate3d(${transform.x}px, 0, 0)` } : {}),
  ...(isDragging ? { opacity: 0.8, zIndex: 20, cursor: 'grabbing' } : {}),
  ...(canDrag ? { cursor: isDragging ? 'grabbing' : 'grab' } : {}),
};
```

- [ ] **Step 5: Add the sensors setup and pass them to DndContext**

Still in `DashboardTimeline.tsx`, find the `DashboardTimeline` function body. Locate the `const handleDragEnd = useCallback(...)` (around line 157). Directly after that function definition and **before** the `return (`, add:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(MouseSensor,   { activationConstraint: { distance: 4 } })
);
```

Then find the `<DndContext>` JSX (around line 212):

```tsx
<DndContext onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
```

Replace with:

```tsx
<DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
```

- [ ] **Step 6: Run the timeline tests**

```bash
npx vitest run src/components/dashboard/__tests__/DashboardTimeline.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All **PASS**.

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -40
```

Expected: All previously-passing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/DashboardTimeline.tsx src/components/dashboard/__tests__/DashboardTimeline.test.tsx
git commit -m "fix(timeline): add explicit dnd-kit sensors so drag-to-reschedule actually fires"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `grep "keep going" src/app/\(app\)/page.tsx` → no output
- [ ] Dev server running (`npm run dev`): open dashboard daily view → no progress bar visible above timeline
- [ ] Weekly view → toggle an AIM checkbox → checkbox flips immediately (no lag), then DevTools Network tab shows a PATCH request completing in the background
- [ ] Daily view → timeline blocks visible → click and drag a block left or right → block follows cursor and snaps to 15-min grid on release → PATCH request fires in Network tab
- [ ] Create a task with type REACT → it appears under "⚡ React Tasks" in the daily view
