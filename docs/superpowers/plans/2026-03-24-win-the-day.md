# Win the Day Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Win the Day" flag to the Task model so users can designate one task per day as their single most important win, shown prominently on the dashboard with a gold/amber glow, and a special confetti celebration when completed.

**Architecture:** Four layers: (1) Prisma schema + migration, (2) API route enforcement of one-per-user-per-day constraint, (3) TaskCard star-icon toggle in daily task list, (4) WinTheDayCard dashboard component with WinTheDayCelebration dopamine animation.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / Framer Motion / canvas-confetti / lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `isWinTheDay Boolean @default(false)` to Task model |
| `src/test/fixtures.ts` | Modify | Add `isWinTheDay: false` default to `createTask` factory |
| `src/app/api/tasks/[id]/route.ts` | Modify | Handle `isWinTheDay` in PATCH: auto-unflag existing WTD for same user+date |
| `src/app/api/tasks/route.ts` | Modify | Accept `isWinTheDay` in POST |
| `src/__tests__/win-the-day-api.test.ts` | Create | Unit tests for auto-unflag logic |
| `src/components/tasks/TaskCard.tsx` | Modify | Add star icon toggle |
| `src/components/tasks/__tests__/TaskCard.test.tsx` | Modify | Tests for star icon rendering and click |
| `src/components/tasks/DailyTaskList.tsx` | Modify | Add `handleWinTheDayToggle` callback |
| `src/components/dashboard/WinTheDayCard.tsx` | Create | Gold/amber highlighted card above Today's Tasks |
| `src/components/dashboard/__tests__/WinTheDayCard.test.tsx` | Create | Tests for WinTheDayCard |
| `src/app/(app)/page.tsx` | Modify | Insert WinTheDayCard + celebration trigger |
| `src/components/dopamine/WinTheDayCelebration.tsx` | Create | Confetti + "You Won the Day!" banner |
| `src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx` | Create | Tests for celebration |
| `src/app/globals.css` | Modify | Add `.wtd-glow` utility class |

---

### Task 1: Prisma Schema — Add isWinTheDay to Task Model

**Files:**
- Modify: `prisma/schema.prisma` (Task model, after `rescheduledTo`)
- Modify: `src/test/fixtures.ts` (`createTask` factory)

- [ ] **Step 1: Add isWinTheDay field to Task model**

In `prisma/schema.prisma`, add after `rescheduledTo DateTime?`:

```prisma
  isWinTheDay    Boolean      @default(false)
```

- [ ] **Step 2: Run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name add_win_the_day_flag`
Expected: Migration creates successfully.

- [ ] **Step 3: Update test fixture**

In `src/test/fixtures.ts`, add `isWinTheDay: false` to the `createTask` factory defaults.

- [ ] **Step 4: Run existing tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: All existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/test/fixtures.ts
git commit -m "feat(schema): add isWinTheDay boolean to Task model"
```

---

### Task 2: API — Auto-Unflag Logic in PATCH Handler

**Files:**
- Modify: `src/app/api/tasks/[id]/route.ts`
- Create: `src/__tests__/win-the-day-api.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/win-the-day-api.test.ts` with tests for:
- Sets `isWinTheDay` on the task when flagging
- Auto-unflags other Win the Day tasks for same user and date
- Does NOT call updateMany when unflagging (`isWinTheDay: false`)
- Does NOT call updateMany when task has no dueDate

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/win-the-day-api.test.ts`
Expected: FAIL — `isWinTheDay` not handled in PATCH.

- [ ] **Step 3: Implement isWinTheDay handling in PATCH**

In `src/app/api/tasks/[id]/route.ts`, after the existing field extraction, add:

```typescript
const { isWinTheDay } = body;
if (isWinTheDay !== undefined) data.isWinTheDay = isWinTheDay;

// Auto-unflag: if flagging as Win the Day, unflag existing for same user+date
if (isWinTheDay === true && task.dueDate) {
  await prisma.task.updateMany({
    where: {
      ownerId: task.ownerId,
      dueDate: task.dueDate,
      isWinTheDay: true,
      id: { not: id },
    },
    data: { isWinTheDay: false },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/win-the-day-api.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/[id]/route.ts src/__tests__/win-the-day-api.test.ts
git commit -m "feat(api): enforce one Win the Day per user per date with auto-unflag"
```

---

### Task 3: API — Accept isWinTheDay in POST Handler

**Files:**
- Modify: `src/app/api/tasks/route.ts`

- [ ] **Step 1: Add isWinTheDay to POST handler**

Extract `isWinTheDay` from body, add to create data as `isWinTheDay: isWinTheDay ?? false`. Add auto-unflag before create if `isWinTheDay && dueDate`.

- [ ] **Step 2: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat(api): accept isWinTheDay flag in task creation"
```

---

### Task 4: Gold Glow CSS Utility

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add wtd-glow class**

```css
.wtd-glow {
  border-color: rgba(245, 158, 11, 0.4);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.15), 0 0 40px rgba(245, 158, 11, 0.05);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): add gold/amber wtd-glow CSS utility"
```

---

### Task 5: TaskCard — Star Icon Toggle

**Files:**
- Modify: `src/components/tasks/TaskCard.tsx`
- Modify: `src/components/tasks/__tests__/TaskCard.test.tsx`

- [ ] **Step 1: Write failing tests for star icon**

Add tests: filled star when `isWinTheDay: true`, outline when false, click calls `onWinTheDayToggle`, stopPropagation.

- [ ] **Step 2: Run test to verify failure**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskCard.test.tsx`

- [ ] **Step 3: Implement star icon**

Add `Star` to lucide imports. Add `onWinTheDayToggle?` to props. Render star button with amber fill when active, gray outline when inactive. Add `wtd-glow` class to card when `isWinTheDay`.

```typescript
{onWinTheDayToggle && (
  <button
    onClick={(e) => { e.stopPropagation(); onWinTheDayToggle(task); }}
    title={task.isWinTheDay ? 'Win the Day task' : 'Designate as Win the Day'}
  >
    <Star className={`h-4 w-4 ${task.isWinTheDay ? 'text-amber-400 fill-amber-400' : 'text-gray-600 hover:text-amber-400/60'}`} />
  </button>
)}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskCard.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TaskCard.tsx src/components/tasks/__tests__/TaskCard.test.tsx
git commit -m "feat(ui): add Win the Day star icon toggle to TaskCard"
```

---

### Task 6: DailyTaskList — Wire Up Toggle

**Files:**
- Modify: `src/components/tasks/DailyTaskList.tsx`

- [ ] **Step 1: Add handleWinTheDayToggle callback**

Optimistic SWR mutation: toggle `isWinTheDay`, unflag others if flagging on.

```typescript
const handleWinTheDayToggle = useCallback(async (task: any) => {
  const newValue = !task.isWinTheDay;
  mutate(async (currentData: any) => {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: newValue }),
    });
    return (Array.isArray(currentData) ? currentData : []).map((t: any) => {
      if (t.id === task.id) return { ...t, isWinTheDay: newValue };
      if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
      return t;
    });
  }, { optimisticData: /* same map logic */, rollbackOnError: true });
}, [mutate]);
```

- [ ] **Step 2: Pass onWinTheDayToggle to TaskCard**

- [ ] **Step 3: Run tests, commit**

```bash
git add src/components/tasks/DailyTaskList.tsx
git commit -m "feat(ui): wire Win the Day toggle in DailyTaskList"
```

---

### Task 7: WinTheDayCard — Dashboard Component

**Files:**
- Create: `src/components/dashboard/WinTheDayCard.tsx`
- Create: `src/components/dashboard/__tests__/WinTheDayCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Tests for: renders task when provided, shows completion state when DONE, shows prompt when null.

- [ ] **Step 2: Implement WinTheDayCard**

Gold/amber bordered card with Star icon header "WIN THE DAY", task title/status, Trophy icon when completed.

- [ ] **Step 3: Run tests, commit**

```bash
git add src/components/dashboard/WinTheDayCard.tsx src/components/dashboard/__tests__/WinTheDayCard.test.tsx
git commit -m "feat(ui): create WinTheDayCard dashboard component"
```

---

### Task 8: WinTheDayCelebration — Confetti Animation

**Files:**
- Create: `src/components/dopamine/WinTheDayCelebration.tsx`
- Create: `src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx`

- [ ] **Step 1: Write failing tests**

Tests for: renders banner when show=true, nothing when false, fires confetti when true.

- [ ] **Step 2: Implement celebration**

Gold-themed confetti via canvas-confetti (already a dependency), Trophy icon, "You Won the Day!" banner with Framer Motion animations. Auto-dismiss after 3s.

- [ ] **Step 3: Run tests, commit**

```bash
git add src/components/dopamine/WinTheDayCelebration.tsx src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx
git commit -m "feat(dopamine): add Win the Day confetti celebration"
```

---

### Task 9: Dashboard — Integrate WinTheDayCard + Celebration

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Add imports and state**

Import WinTheDayCard and WinTheDayCelebration. Add `winTheDayTask` derived from task list, `showWinCelebration` state, useRef to track status transitions.

- [ ] **Step 2: Add components to JSX**

Insert `<WinTheDayCard>` above Today's Tasks section. Add `<WinTheDayCelebration>` with show/onComplete.

- [ ] **Step 3: Run full test suite + build**

```bash
npx vitest run && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/page.tsx
git commit -m "feat(dashboard): integrate Win the Day card and celebration"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**
- [ ] **Step 2: Run build**
- [ ] **Step 3: Manual smoke test** — flag task, verify auto-unflag, complete WTD task, verify confetti
- [ ] **Step 4: Commit any fixes**
