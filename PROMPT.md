# Prism App Overhaul — Ralph Loop Prompt

You are iteratively overhauling the Prism app (Next.js 14 / TypeScript / Prisma / PostgreSQL). Each iteration you pick up where the last left off.

## How This Loop Works

1. Read `OVERHAUL-PROGRESS.md` to find the next unchecked `[ ]` task
2. Implement that task fully
3. Run `/simplify` to refactor, debug, and improve code quality
4. Git commit the changes with a descriptive message
5. Update `OVERHAUL-PROGRESS.md` — change `[ ]` to `[x]` for the completed task
6. If ALL tasks are `[x]`, output: `<promise>ALL OVERHAUL TASKS COMPLETE</promise>`
7. Otherwise, move to the next `[ ]` task and repeat

## Important Rules

- ONE task per iteration. Do it well, simplify, commit, then move on.
- After implementing each task, run `/simplify` — this catches bugs, improves code quality, removes duplication, and ensures consistency.
- Always read the relevant source files before modifying them.
- Preserve existing functionality — don't break working features.
- Follow existing code patterns (Tailwind CSS, SWR for data fetching, Prisma for DB, NextAuth for auth).
- When adding UI, match the existing design system (Prism colors: violet, indigo, cyan, teal, rose, amber; glass-morphism style; Inter + Plus Jakarta Sans fonts).
- When modifying Prisma schema, run `npx prisma db push` after changes.
- Run `npm run build` periodically (every 3-5 tasks) to catch type errors.

## Project Structure Reference

- Pages: `src/app/(app)/` (protected routes)
- API: `src/app/api/`
- Components: `src/components/` (organized by feature)
- Utilities: `src/lib/`
- Database: `prisma/schema.prisma`
- Styles: `src/app/globals.css` + Tailwind

---

## PHASE 1: Critical Bugs (Trust-Breaking)

### Task 1: Fix date off-by-one bug
**Files:** Any file using `new Date()` with timezone manipulation, `src/lib/review-dates.ts`
**Problem:** The app shows Sunday Mar 29 as "Today" when it's actually Saturday Mar 28. Affects Dashboard, Tasks page, Weekly view "Today" badge, Reports date filtering.
**Fix:** Find all date calculations that shift timezone incorrectly. The root cause is likely UTC vs local timezone conversion. Ensure `new Date()` returns the user's local date. Check:
- Dashboard greeting and date display
- Tasks page date picker "Today" button
- Weekly view "Today" badge
- Review date calculations in `src/lib/review-dates.ts`
- Any usage of `startOfDay`, `startOfWeek` with incorrect timezone options
- Ensure `date-fns` functions use `{ weekStartsOn: 0 }` (Sunday) consistently OR respect user settings

### Task 2: Fix dashboard initial load showing no user data
**Files:** `src/app/(app)/page.tsx`, `src/components/dashboard/*`
**Problem:** First load shows "Good evening, there" with 0 items. After interaction it refreshes to show "Good evening, Munder" with actual data (3 items, 2.5h).
**Fix:** This is a race condition where user data isn't loaded on initial render. Ensure the SWR/fetch call for user data and dashboard stats completes before rendering. Add proper loading states or use `suspense: true` in SWR config. Check the authentication session loading timing.

### Task 3: Fix non-admin users not seeing assigned tasks
**Files:** `src/app/api/tasks/route.ts`, any task query logic
**Problem:** Non-admin users only see tasks where `ownerId = userId`. They should ALSO see tasks assigned to them (`assigneeId = userId`). If a task is owned by admin but assigned to Sarah, Sarah can't see it.
**Fix:** Update task queries to use `OR` condition: `WHERE ownerId = userId OR assigneeId = userId`. Apply this to all task listing endpoints (tasks page, dashboard, reviews, calendar). Ensure no duplicate results when user is both owner and assignee.

### Task 4: Add validation messages to review wizard steps
**Files:** `src/components/reviews/WeeklyReviewWizard.tsx`, `src/components/reviews/weekly-steps/*`, `src/components/reviews/MonthlyReviewWizard.tsx`, `src/components/reviews/YearlyReviewWizard.tsx`
**Problem:** Multiple wizard steps silently prevent advancement when required fields aren't completed. "Next Step" does nothing — no error, no highlight, no toast. Confirmed on Steps 4, 6, 7, 10.
**Fix:** For every step that has advancement requirements:
- Show a toast notification or inline error when "Next Step" is clicked but requirements aren't met
- Highlight incomplete fields with a red border or shake animation
- Show specific messages: "Please save your responses before continuing", "Select your top 3 tasks to proceed", "Choose Keep/Automate/Eliminate for each task"
- Use a consistent validation pattern across all wizard types

### Task 5: Prevent duplicate review creation
**Files:** `src/app/api/reviews/route.ts`, `src/app/(app)/reviews/page.tsx`, `src/components/reviews/*`
**Problem:** Multiple reviews of the same type created for the same date/period. Pending section has duplicate WEEKLY reviews for same date. Completed section has triplicate entries.
**Fix:**
- In the API: Before creating a review, check if one already exists for that type + period. Return error if duplicate.
- In the UI: When scheduling a review, show prompt: "You already have a weekly review for this period. Continue that one instead?"
- Clean up existing duplicates via a one-time migration or API call

### Task 6: Fix Goal Stack Guide modal "Got it" button
**Files:** `src/components/goals/*` (find the guide modal component)
**Problem:** "Got it" button doesn't close the modal. X button requires multiple attempts. Modal re-appears every visit unless "Don't show again" is checked.
**Fix:** Ensure the "Got it" button onClick handler calls the close function. Check if `onClick` is bound correctly and not being intercepted by event bubbling. Save the "Don't show again" preference to localStorage or user settings.

### Task 7: Fix sidebar showing Training despite unchecked in settings
**Files:** `src/components/layout/*` (sidebar component), `src/app/api/settings/*`
**Problem:** Training is unchecked in Settings > Visible Features but still appears in sidebar.
**Fix:** The sidebar component needs to read the user's visible features settings and conditionally render nav items. Check if the settings API is saving correctly AND if the sidebar reads from that saved state (not just defaults).

### Task 8: Fix review wizard URL step parameter off-by-one
**Files:** `src/app/(app)/reviews/[id]/complete/page.tsx`, `src/components/reviews/ReviewWizard.tsx`
**Problem:** URL `?step=7` shows Step 8 content. Indexing mismatch between URL parameter (0-based?) and display (1-based).
**Fix:** Standardize: URL parameter should be 1-based to match display. `?step=1` = Step 1. Ensure `parseInt(searchParams.step)` maps directly to the displayed step number.

---

## PHASE 2: Visibility/Contrast Bugs

### Task 9: Fix Power Down page extremely low contrast text
**Files:** `src/app/(app)/powerdown/*`, `src/components/powerdown/*`, `src/app/globals.css`
**Problem:** Text on Power Down pages is nearly invisible — streak counter, description, step indicators all barely readable against light background.
**Fix:** Find the CSS classes or Tailwind utilities causing low opacity/light colors. Replace with proper contrast ratios (WCAG AA minimum). Check for `text-gray-200` or similar on light backgrounds. Apply fixes to all Power Down steps including Step 3 task selection items.

### Task 10: Fix Leaderboard faded text for non-first-place users
**Files:** `src/app/(app)/leaderboard/*`, `src/components/leaderboard/*` (or wherever leaderboard is rendered)
**Problem:** James Wilson (#2) entry is nearly invisible. De-emphasis went too far.
**Fix:** Non-current-user entries should be slightly de-emphasized (e.g., `text-gray-600`) but still clearly readable. Not `text-gray-200` or very low opacity.

### Task 11: Fix Training page stale loading state
**Files:** `src/app/(app)/training/*`
**Problem:** Loading indicator persists 2-3 seconds even when there are no items.
**Fix:** Show empty state immediately if the API returns empty. Reduce unnecessary delay. Consider optimistic rendering: show empty state by default and replace with content if data arrives.

---

## PHASE 3: Data Integrity & Navigation

### Task 12: Fix Reports showing duplicate weekly entries
**Files:** `src/app/(app)/reports/*`, `src/app/api/reports/*`
**Problem:** 7 "WEEKLY" entries all dated 2026-03-29, with mixed Pending/Completed status.
**Fix:** Deduplicate in the API query. If multiple entries exist for the same type+date, show only the most recent or merge them. Add distinguishing labels if they represent different sections.

### Task 13: Make completed reviews viewable (Review History)
**Files:** `src/app/(app)/reviews/page.tsx`, `src/components/reviews/*`, `src/app/api/reviews/[id]/route.ts`
**Problem:** Completed reviews are listed but clicking them does nothing. No way to revisit past responses, reflections, or KPI snapshots.
**Fix:**
- Create a read-only review detail view that shows all saved responses
- When clicking a completed review, navigate to `/reviews/[id]` showing the summary
- Display: Successes & Difficulties text, KPI snapshots, task rankings, calendar plans, maintenance decisions
- This is the foundation for the "Review Journal" concept

### Task 14: Add minimum task name validation
**Files:** `src/app/api/tasks/route.ts`, `src/components/tasks/*` (task creation forms)
**Problem:** A task named "s" exists — likely test data. No validation on task name length.
**Fix:** Add validation: task name must be >= 3 characters. Show inline error on creation forms. API should reject short names with 400 response.

### Task 15: Fix route inconsistencies
**Files:** `src/middleware.ts`, `next.config.mjs`
**Problem:** `/power-down` returns 404 (actual route is `/powerdown`). `/dashboard` returns 404 (actual is `/`).
**Fix:** Add redirects in Next.js middleware or `next.config.mjs`:
- `/power-down` -> `/powerdown`
- `/dashboard` -> `/`
- Any other common URL guesses users might try

### Task 16: Fix Calendar vs Dashboard week start inconsistency
**Files:** `src/app/(app)/calendar/*`, `src/components/dashboard/*`, `src/app/api/settings/*`
**Problem:** Calendar shows Mar 22-28 (Sunday start), Dashboard Weekly shows Mar 24-30 (Tuesday start).
**Fix:** Both views must use the same week start day. Read from user settings (Settings has week start options). Default to Sunday (weekStartsOn: 0). Apply consistently to `startOfWeek()` calls in both calendar and dashboard.

---

## PHASE 4: Review System Enhancements

### Task 17: Overhaul Weekly Review wizard (11 steps)
**Files:** `src/components/reviews/WeeklyReviewWizard.tsx`, `src/components/reviews/weekly-steps/*`
**Steps must be:**
1. Current Goals — Show goal hierarchy with progress bars, grouped by stack
2. Review Previous Tasks — Last week's tasks with completed/incomplete counts. Reschedule button for incompletes. Capture successes
3. KPI Progress — Update weekly KPI actuals with inline number entry, add progress notes
4. Difficulties & Successes — Free-text for both wins and challenges. Must save before advancing
5. Create/Adjust Weekly Goals — From monthly goals, with goal creation sidebar coach
6. Create/Modify Tasks — Full task list with type/priority badges, edit/delete, "+ Add Task". Tasks linked to goals. Default assign self
7. Rank Top 3 Tasks — "Select next most important" pattern: pick #1, then #2, then #3
8. Calendar Split — Step A: Work Blocks — Left panel: block types (Deep Work, Normal Work, AIM). Right panel: week calendar with Google Calendar events. Create blocks by drag
9. Calendar Split — Step B: Tasks into Blocks — Drag tasks and AIMs into work blocks. Grouped by type. Can adjust/move/resize/cancel blocks
10. Maintenance Review — Keep/Automate/Eliminate for each maintenance task
11. Notes & Completion — Summary and notes field

### Task 18: Overhaul Monthly Review wizard (9 steps)
**Files:** `src/components/reviews/MonthlyReviewWizard.tsx`
**Steps:**
1. Big Picture — Show HHG + yearly goals for motivation
2. Current Monthly Goals — Expandable to weekly goals
3. Review Weekly Goals — Completed/incomplete for the month
4. Successes & Difficulties — Capture both
5. Weekly KPI Progress — Update actuals for weekly goals
6. On-Track Assessment — Each weekly goal assessed. Auto-fills monthly on-track
7. Modify Goals — Weekly + monthly goals at all levels. Reorder weekly goals via drag
8. Create Weekly Goals — With KPIs, correct dates (exactly one week). Missing weeks get one-click placeholder. Goal creation sidebar coach
9. Notes & Completion

### Task 19: Overhaul Yearly Review wizard
**Files:** `src/components/reviews/YearlyReviewWizard.tsx`
**Steps:**
1. HHG Assessment — Is the High Hard Goal still right? Adjust if needed
2. Current Year Overview — Yearly goals expandable to monthly breakdowns
3. Review Monthly Goals — Completed/incomplete, carry forward incompletes
4. Successes & Difficulties — Capture both
5. Monthly KPI Progress — Update actuals
6. On-Track Assessment — Each monthly goal assessed. Auto-fills yearly on-track
7. Modify Goals — Adjust monthly goals for current + upcoming year
8. Create Monthly Goals — For upcoming year, with KPIs + goal creation sidebar coach
9. Notes & Completion

### Task 20: Expand Power Down ritual (9 steps)
**Files:** `src/components/powerdown/*`, `src/app/api/powerdown/*`
**Steps:**
1. Review Today — Completions and wins
2. Current Weekly Goals — Weekly goals with tasks underneath. See completed + incomplete. Update and create tasks. React tasks visible
3. Select Top 3 for Tomorrow — Ranked 1st/2nd/3rd. All task types eligible. Show goal linkage, priority, estimated duration per task
4. Calendar Split View — Tomorrow's calendar (single day). Drag tasks into blocks. Move/resize/cancel. Shows previous incomplete tasks + upcoming week tasks. Highest importance at top with stars
5. Clear Goals — Create clear goal checklist for each task assigned to tomorrow, starting with top 3. Persist across power-downs if task not completed
6. Goal Clarity Summary — Final checklist of tomorrow's tasks with clear goals. Editable
7. Capture Ideas — Free text, auto-saved to Ideas section (without ICE scoring)
8. Distractions — Log today's distractions
9. Gratitudes — Capture gratitudes

### Task 21: Build Calendar Split View shared component
**Files:** Create `src/components/calendar/CalendarSplitView.tsx`
**Used in:** Weekly review steps 8-9, Power Down step 4
**Left panel:** Unscheduled items grouped by type (Improve/React/Maintenance/AIMs). Weekly hour target progress bar (scheduled / 35h)
**Right panel:** Full calendar (week view for weekly, day view for power-down). Google Calendar events shown. Drag from left to drop on calendar. Drag back or click X to unschedule. Resize blocks. Move to reschedule
**Color coding (app-wide consistent):**
| Type | Color |
|------|-------|
| Improve tasks | Indigo #818cf8 |
| React tasks | Yellow #fbbf24 |
| Maintenance | Cyan #22d3ee |
| AIMs | Teal #2dd4bf |
| Reviews | Amber #f59e0b |
| Google Calendar | Purple #a855f7 |
| Power Down | Violet #8b5cf6 |
| Meetings | Emerald #10b981 |

### Task 22: Connect Top 3 ranking to Dashboard Win the Day
**Files:** `src/components/dashboard/*`, `src/app/api/tasks/*`
**Fix:** Step 7's ranked top 3 tasks should populate the Dashboard's "Win the Day" feature and Focus Mode. Store the ranking in the database (task priority or separate ranking table). Dashboard reads this ranking and displays #1 prominently: "Complete this one task and you've won the day."

### Task 23: Monthly review shows weekly review summaries
**Files:** `src/components/reviews/MonthlyReviewWizard.tsx`
**Fix:** In the monthly review Big Picture step (or a new step 2), show a summary of 4-5 weekly reviews completed that month — key wins, challenges, KPI trends. Query completed weekly reviews for the month and aggregate their Successes & Difficulties entries.

### Task 24: Review cadences show next due date
**Files:** `src/app/(app)/reviews/page.tsx`
**Fix:** Next to each cadence (WEEKLY/MONTHLY/YEARLY "Scheduled"), show "Next: Sunday, March 29" or "Due in 2 days". Calculate from the cadence frequency and last completed review date.

---

## PHASE 5: Dashboard & Goal Stack

### Task 25: Dashboard layout overhaul
**Files:** `src/app/(app)/page.tsx`, `src/components/dashboard/*`
**Layout:**
- Greeting bar: Name, items scheduled count, weekly hour target (X / 35h), Quick Add button, Add Idea button
- Derail alert banner for any AIMs off-track
- Horizontal timeline: Today's blocks (6am-8pm) with red "now" indicator, color-coded blocks
- Win the Day: Shows ranked top 1-3 tasks from power-down. #1 = "Complete this one task and you've won the day"
- Grouped checklists: Improve Tasks (with clear goals inline, time block badge), React Tasks, Maintenance (with process checklist count), AIMs Today (streak, derail status)
- Power Down reminder with "Start" button at scheduled time
- Feedback button at top, stores for admin review

### Task 26: Add clear "What should I do now?" signal
**Files:** `src/components/dashboard/*`
**Fix:** Show the #1 most important task at the top of the daily dashboard with a large "Start" button. This should be the #1 ranked task from the weekly review or power-down. If no ranking exists, show the highest-priority improve task.

### Task 27: Add progress visualization to dashboard
**Files:** `src/components/dashboard/*`
**Add:**
- Percentage of today's tasks completed (circular progress or progress bar)
- Streak information (from AIMs)
- Weekly progress toward goals
- Motivational element: "You've completed 3/5 tasks today - keep going!"
- Brief celebration animation when completing the Win the Day task

### Task 28: Goal Stack daily actions view
**Files:** `src/app/(app)/goals/*`, `src/components/goals/*`
**Fix:** Add a "Daily Actions" tab or view that traces today's tasks back to their parent goals. Show: Task -> Weekly Goal -> Monthly Goal -> Yearly Goal -> HHG. This makes the goal-task connection visible and motivating.

### Task 29: Goal creation sidebar coach
**Files:** Create `src/components/goals/GoalCreationCoach.tsx`
**Collapsible side panel available everywhere goals are created (reviews, goal stack page).**
**Guidance includes:**
- Purpose alignment check
- Specificity: "Is this binary? Can you know exactly when it's done?"
- Measurability: "Add a measurable target"
- Ambition: "Confidence should be 6-7/10"
- Timeline validation
- Examples of good vs bad goals

### Task 30: Goal Stack label and UI fixes
**Files:** `src/components/goals/*`
**Fixes:**
- Display "High Hard Goal" instead of "HHG" everywhere
- Restore KPI button on goal cards
- Weekly goals: correct start/end dates (exactly one week). Missing weeks get one-click placeholder
- Goal assignment: HHG/yearly/monthly goals assignable to multiple people, tasks to one person

---

## PHASE 6: AIM System & Tasks

### Task 31: AIM simplified default view
**Files:** `src/app/(app)/aims/*`, `src/components/aims/*`
**Collapsed cards showing:** AIM name + emoji, streak count (prominent), current phase badge (SEED/SPROUT/GROW/FLOW), next scheduled time, Complete button. Expand card for: heatmap, progress chart, activities, settings.

### Task 32: Custom AIMs
**Files:** `src/components/aims/*`, `src/app/api/aims/*`
**Users can create custom AIMs** with: frequency, duration, activities, phase system, groupability toggle.

### Task 33: AIM workout sub-types
**Files:** `src/components/aims/*`, `src/app/api/aims/*`
**Exercise AIMs support optional sub-types** (leg day, cardio, upper body, etc.):
- User add/modify/remove sub-types
- Per-type frequency setting (e.g., 1x/week cardio)
- Selected during scheduling (power-down, weekly review, calendar)
- Entirely optional

### Task 34: AIM grouping social feature
**Files:** `src/components/aims/*`, `src/app/api/aims/*`
- Toggle per AIM: public/groupable or private
- Tooltip explaining what grouping means
- Color indicator on groupable AIMs in calendar views
- Team members see each other's groupable AIMs
- Click to join a team member's session
- Notification sent to all parties when someone joins

### Task 35: AIM growth stage explanations
**Files:** `src/components/aims/*`
**Fix:** Add tooltips or info icons explaining phase advancement: "Complete this aim 3 consecutive weeks to advance from SEED to SPROUT." Allow selecting later phases (not forced to start at SEED). Clear explanation of each phase and its multipliers.

### Task 36: Task type routing via Quick Add
**Files:** `src/components/dashboard/*` (Quick Add component), `src/components/tasks/*`
**When creating via Quick Add:**
- Improve -> Navigate to /goals, open task creator
- React -> Navigate to /reactive-tasks/new form
- Maintenance -> Navigate to /processes
- Review -> Navigate to /reviews
- Idea -> Navigate to /ideas

### Task 37: Clear Goals (checklists) system
**Files:** `src/components/tasks/*`, `src/app/api/tasks/*`, `prisma/schema.prisma`
**Created during power-down** for each scheduled task. Apply to ALL task types. Stored as checklist items on the task. Visible in: task detail, Google Calendar event description, dashboard task expansion. Maintenance tasks: checklist sourced from Process definitions. Persist across power-downs if task not completed.

### Task 38: Task type naming clarity
**Files:** `src/components/tasks/*`, `src/components/dashboard/*`
**Add tooltips/descriptions:** Improve = "Move goals forward", React = "Respond to incoming requests", Maintenance = "Keep things running." Show in Quick Add dropdown and task type selectors.

---

## PHASE 7: UX Polish & New Features

### Task 39: Onboarding flow for new users
**Files:** Create `src/components/onboarding/OnboardingWizard.tsx`
**Guided walkthrough:**
1. Set your High Hard Goal
2. Break it into yearly/monthly goals
3. Set up daily AIMs
4. Configure Power Down ritual
5. Start your first day
**Show on first login. Re-activatable from settings.**

### Task 40: Add Idea floating action button
**Files:** `src/components/layout/*` (add to app layout)
**A persistent floating button or Cmd+I shortcut** available from ANY page that opens a quick idea capture modal. Save directly to Ideas section.

### Task 41: Calendar drag-and-drop visual feedback
**Files:** `src/components/calendar/*`
**Add:** Drop zone highlighting, time slot snapping visual indicators, ghost preview of where item will land while dragging.

### Task 42: Keyboard shortcuts
**Files:** Create `src/components/KeyboardShortcuts.tsx`, add to app layout
**Shortcuts:**
- Cmd+N: Create task
- Cmd+D: Mark task complete
- D/W: Switch Daily/Weekly views
- F: Open Focus Mode
- G+D: Go to Dashboard, G+T: Tasks, G+C: Calendar, G+R: Reviews, G+G: Goals
- Cmd+I: Quick idea capture
- Cmd+K: Global search (Task 45)

### Task 43: Reviews page tab consistency
**Files:** `src/app/(app)/reviews/page.tsx`
**Fix:** My Reviews and Team Reviews tabs should share consistent layout. Add preview descriptions: "Weekly Review: 11 steps covering goals, tasks, KPIs, calendar planning, and maintenance review." Show what each review type involves before starting.

### Task 44: Today's Wins section
**Files:** `src/components/dashboard/*`, `src/app/(app)/leaderboard/*`
**Dashboard should celebrate completed tasks** more prominently. When finishing the Win the Day task, show celebration animation. Track in visible wins counter. Populate the Leaderboard's "Recent Wins" panel.

### Task 45: Global search (Cmd+K command palette)
**Files:** Create `src/components/CommandPalette.tsx`, add to app layout
**Search across:** tasks, goals, ideas, reviews, AIMs, processes. Show results in categorized dropdown. Navigate to selected item. Recent searches. Fuzzy matching.

### Task 46: Settings auto-save
**Files:** `src/app/(app)/settings/page.tsx`
**Fix:** Replace multiple separate Save buttons with either: (a) auto-save on change with toast confirmation, or (b) single "Save All Settings" button at bottom.

### Task 47: Reactive tasks list view
**Files:** `src/app/(app)/reactive-tasks/*` or wherever the route lives
**Fix:** Default view should be a list/table of existing reactive tasks. "New" button to create. Currently goes directly to creation form with no way to view existing tasks.

---

## PHASE 8: Process KPI System (New Feature)

### Task 48: Process KPI tracking on Processes page
**Files:** `prisma/schema.prisma`, `src/app/api/processes/*`, `src/app/(app)/processes/*`
**Each process gets KPIs attached:**
- KPI has: name, target value, unit
- When completing a maintenance task linked to a process, inline number entry to log KPI actual
- Each KPI has manually-set goals at every time level: weekly, monthly, yearly, 5-year, HHG-level
- Goals do NOT auto-calculate — user sets each independently
- KPIs can optionally link to a goal in Goal Stack
- Processes assigned to specific individuals. Filter: "Assigned to me"
**DB schema additions:** ProcessKPI model (name, targetValue, unit, processId), KPIEntry model (actualValue, date, userId, kpiId), KPIGoal model (kpiId, timeLevel, targetValue)

### Task 49: Company KPI Dashboard (default view)
**Files:** `src/app/(app)/processes/page.tsx` or new dashboard component
**Default company-wide view showing:**
- This Week's KPIs: actual vs goal with progress bars, green/yellow/red status
- This Month's KPIs: monthly actual vs goal, with 4-week breakdown
- Yearly KPIs: yearly actual vs goal, with 12-month breakdown
- 5-Year / HHG: long-range view with yearly progress
- Drill-down: click any KPI to expand individual contributions (company total by default)

### Task 50: Individual KPI view
**Files:** Same as Task 49
**Toggle at top:** "Company" vs "My KPIs". Individual view shows only user's assigned processes/KPIs with same time rollup structure.

### Task 51: KPI projections and forecast lines
**Files:** Process KPI components
**Based on current pace, show:**
- Projected trendline: "At your current pace of 3 ads/week, you'll hit 144/year (goal: 150) — on track"
- Dashed forecast line on charts
- On-track status indicators: green (on track), yellow (at risk), red (behind)

### Task 52: Chart and table view toggle
**Files:** Process KPI dashboard
**Two view modes:**
- Charts (default): Line charts for trends, bar charts for comparisons, circular progress, forecast lines
- Table: Tabular with actual numbers, percentages, goal vs actual columns, color-coded status

### Task 53: Process KPI integration with existing features
**Files:** Multiple integration points
- Weekly Review Step 3 (KPI Progress): Auto-populate from process KPI logs
- Weekly Review Step 10 (Maintenance Review): Show KPI data to inform Keep/Automate/Eliminate
- Goal Stack: Linked KPIs reflect in goal progress bars
- Reports: Process KPI data with time-period filtering
- Dashboard: "Process Health" summary widget (on-track vs at-risk vs behind)

---

## PHASE 9: Performance & Export

### Task 54: Performance optimization
**Files:** Throughout the app
**Actions:**
- Lazy load heavy components (FullCalendar, GoalStackTree, charts) with `dynamic(() => import(...), { ssr: false })`
- Add virtual scrolling for long lists (goal trees, task lists, review histories)
- Optimize SWR revalidation intervals
- Memoize components and stabilize callback references
- Route-level code splitting
- Prefetch critical data on navigation
- Minimize API payload sizes

### Task 55: Reports and Export page
**Files:** `src/app/(app)/reports/*`
**Rename to "Reports & Export". Add:**
- Review history: all completed reviews with answers, timestamps
- Task completion logs: daily/weekly/monthly rates
- AIM streaks over time
- KPI trends: progress charts
- Export: filter by date range + type, download as CSV or JSON

### Task 56: Dark mode auto-switch for Power Down
**Files:** `src/components/powerdown/*`, `src/components/ThemeProvider.tsx`
**At Power Down scheduled time (e.g., 8:30 PM)**, auto-suggest or auto-switch to dark mode. Add a setting to enable/disable this behavior.

### Task 57: Process page starter templates
**Files:** `src/app/(app)/processes/*`, seed data or template system
**Provide templates:** "Client Onboarding", "Weekly Planning", "Product Launch", "Content Creation", "Sales Pipeline". Users customize from templates rather than starting from scratch. Show templates when Processes page is empty.
