# Prism — How It Works (Comprehensive Reference Guide)

*Last updated: March 29, 2026*
*Based on live walkthrough of the running application at localhost:3000*
*Note: Screenshots were limited this session due to Next.js dev server instability (503 errors on CSS/JS bundles). Content is based on three full rounds of hands-on evaluation.*

---

## Table of Contents

1. [App Overview & Philosophy](#1-app-overview--philosophy)
2. [Navigation & Sidebar Structure](#2-navigation--sidebar-structure)
3. [Dashboard](#3-dashboard)
4. [Goal Stack](#4-goal-stack)
5. [Training](#5-training)
6. [Tasks](#6-tasks)
7. [Reactive Tasks](#7-reactive-tasks)
8. [Ideas](#8-ideas)
9. [Aims](#9-aims)
10. [Calendar](#10-calendar)
11. [Reviews](#11-reviews)
12. [Power Down](#12-power-down)
13. [Leaderboard](#13-leaderboard)
14. [Reports & Export](#14-reports--export)
15. [Processes](#15-processes)
16. [Settings](#16-settings)
17. [Daily Workflow — How It All Connects](#17-daily-workflow--how-it-all-connects)
18. [Key Concepts Glossary](#18-key-concepts-glossary)

---

## 1. App Overview & Philosophy

Prism is a goal-oriented productivity system designed around one core idea: **your daily work should always connect to your long-term vision.** It uses a cascading hierarchy where big-picture goals break down into progressively smaller, actionable pieces until they become today's tasks.

The core loop is: **Set goals → Break them into tasks → Execute daily → Build habits → Review progress → Repeat.**

Prism is not just a task manager. It combines goal setting, task management, habit tracking, calendar scheduling, structured reviews, gamification, and an evening shutdown ritual into a single integrated system. Every feature feeds into the others.

### The Four Pillars

The app organizes its features into four sidebar groups that reflect its philosophy:

- **WORK** — Where you define *what* to do (Dashboard, Goal Stack, Training, Tasks, Reactive Tasks, Ideas)
- **RITUALS** — Where you build rhythm and reflection (Aims, Calendar, Reviews, Power Down)
- **INSIGHTS** — Where you measure progress and motivate (Leaderboard, Reports)
- **SYSTEM** — Where you configure the tool (Processes, Settings)

### User Model

Prism supports multiple users with roles. The primary user is logged in as "Munder (Admin)" with full access. Other team members (e.g., James Wilson, Sarah Chen) appear in the Leaderboard and can participate in Team Reviews. Admin users can see a "Create User (Dev)" section in Settings.

---

## 2. Navigation & Sidebar Structure

### Sidebar Layout

The left sidebar is always visible and serves as the primary navigation. It is organized into four labeled sections with icons for each item:

**WORK section:**
- **Dashboard** (grid icon) — Your daily command center; the app's home page
- **Goal Stack** (target icon) — Cascading goal hierarchy from vision to weekly
- **Training** (book icon) — Learning and development resources
- **Tasks** (checkbox icon) — Day and Week task views
- **Reactive Tasks** (lightning icon) — Unplanned work using the CARS framework
- **Ideas** (lightbulb icon) — Idea capture with ICE scoring

**RITUALS section:**
- **Aims** (timer icon) — Daily/Weekly habits with streak tracking
- **Calendar** (calendar icon) — Weekly schedule with drag-and-drop
- **Reviews** (clipboard icon) — Weekly/Monthly/Yearly reflection cadences
- **Power Down** (moon icon) — Evening shutdown ritual

**INSIGHTS section:**
- **Leaderboard** (trophy icon) — Team gamification
- **Reports** (bar chart icon) — Data analysis and export

**SYSTEM section:**
- **Processes** (flow icon) — Business functions and process mapping
- **Settings** (gear icon) — App configuration

### Sidebar Footer
At the bottom of the sidebar: a **streak counter** with a fire icon showing your current engagement streak (e.g., "5 day streak"). This is a persistent motivator visible on every page.

### Sidebar Controls
- A **collapse/expand toggle** (double-arrow icon at top-right of sidebar) lets you minimize the sidebar to icons only for more screen space.
- The active page is highlighted with a purple left-border indicator.
- The "Prism" logo at the top links back to the Dashboard.

### Top Bar
The top-right corner of every page shows: **Feedback** button, **User Name (Role)** display, **Admin** badge (if applicable), and **Sign out** link.

### Visible Features
Which sidebar items appear is controlled by toggles in Settings → Visible Features. Each feature can be individually shown or hidden. Hidden features are still accessible via direct URL.

---

## 3. Dashboard

**URL:** `/` (root)
**Purpose:** Your daily command center — the first thing you see when you open Prism. Shows what needs your attention today and this week.

### Two Views: Daily and Weekly

The Dashboard has two tabs at the top-left:

#### Daily View (Default)
Shows everything relevant to *today*:

- **Greeting header:** "Good afternoon, Munder" (time-of-day aware) with the full date (e.g., "Sunday, March 29, 2026") and a summary line: "0 items scheduled today · 0h scheduled"
- **Action buttons** (top-right): **"+ Quick Add"** to create a task immediately, and **"Add Idea"** (yellow lightbulb) to capture an idea
- **Progress bar:** Shows task completion for the day (e.g., "1/3 tasks done — keep going!" at 33%) with a green fill that grows as you complete tasks
- **Today's Schedule:** A horizontal timeline from 6am to 8pm showing scheduled blocks. A red vertical line indicates the current time. This is a mini version of the Calendar view
- **Hours bar:** Shows "0h / 35h scheduled" — how many hours of your weekly capacity are booked
- **Top Tasks prompt:** "No top tasks selected yet. Complete a Power Down to set your priorities." — This is where your priority tasks appear after you run the Power Down ritual
- **Aims attention alert:** An orange/red banner across the top: "2 aims need attention (2 needs caution)" — links you to aims that are falling behind
- **Improve Tasks section:** Lists your active Improve-type tasks with checkboxes, status badges (TODO/DONE), priority color dots, goal stack labels (e.g., "Personal Stack"), and due dates
- **Power Down section:** At the bottom, a prompt to "Prepare tomorrow's plan & close out today" — a direct launcher for the Power Down ritual

**How it works as a user:** You open the app, see your Daily view, check what tasks you have, see your progress bar fill as you check things off, and at the end of the day hit Power Down to plan tomorrow.

#### Weekly View
Shows the full week (Sunday through Saturday) with:

- **Same greeting and date header**, but now "Week of Mar 29 – Apr 4"
- **Day-by-day breakdown:** Each day listed with its name, date, a "Today" badge on the current day, and a count of tasks/aims (e.g., "(0)")
- **"No tasks or AIMs"** message under empty days
- **"+ Quick Add"** button to add tasks to any day

**How it works:** You use this view to plan your week, see what's coming up, and spot gaps or overloaded days.

#### Focus Mode vs. Full View
A toggle in the top-right switches between:
- **Focus Mode:** Compact view showing just the essentials (tasks + schedule)
- **Full View:** Expanded view with the greeting, progress bar, schedule timeline, and all task sections visible

---

## 4. Goal Stack

**URL:** `/goals`
**Purpose:** Define your cascading goal hierarchy — from your life's ambition down to this week's specific targets.

### The Hierarchy

The Goal Stack uses a 5-level cascading structure:

1. **High Hard Goal (HHG)** — Your ultimate, audacious long-term ambition (think 10+ years). Example: "Build the most successful restaurant franchise in the region"
2. **5-10 Year Goal** — A major milestone on the path to the HHG. Example: "Open 15 franchise locations across the state"
3. **Yearly Goal** — What you need to accomplish this year. Example: "Open 3 new locations and increase revenue by 25%"
4. **Monthly Goal** — This month's specific target. Example: "Finalize Q2 location scouting and launch marketing campaign"
5. **Weekly Goal** — This week's concrete deliverables. Example: "Draft location scouting plan, meet with 2 potential landlords"

### How It Looks

The page displays as a vertical stack of expandable cards. Each level is indented or nested under its parent. Goals show:
- Title text
- A colored indicator/icon for the goal level
- **KPI badges** (purple "KPIs" tags) — indicating that Key Performance Indicators are attached to that goal
- Expand/collapse controls to show child goals

### Guide Modal

When you first visit Goal Stack, a **Guide modal** appears explaining the hierarchy concept with visual examples. It has a "Got it" button and an X to dismiss. (Note: as of the latest check, these buttons have a bug — clicking outside the modal is the current workaround to dismiss it.)

### How to Use It

1. Start by defining your HHG — your biggest aspiration
2. Break it into 5-10 year milestones
3. From each milestone, derive this year's goals
4. Each month, set monthly goals tied to the yearly ones
5. Each week, define weekly goals tied to the monthly ones
6. Tasks are then created from weekly goals — so every task traces back to your life vision

### Key Concept: "Personal Stack"
Tasks reference which goal stack they belong to. On the Dashboard and Tasks page, you'll see labels like "Personal Stack" on tasks, indicating their parent goal hierarchy.

---

## 5. Training

**URL:** `/training`
**Purpose:** A dedicated space for learning and professional development resources.

### What It Is

Training is a section for tracking learning activities, courses, reading materials, or development goals that don't fit neatly into the task/goal structure. It's listed under the WORK section alongside Task-type activities.

### Visibility Note

Training visibility in the sidebar is controlled by the Settings → Visible Features toggle. When enabled, it appears between "Goal Stack" and "Tasks" in the sidebar. The feature has had intermittent visibility issues (flickering during page loads on some pages) related to how settings are applied asynchronously.

---

## 6. Tasks

**URL:** `/tasks`
**Purpose:** Your primary task management view. See, create, complete, and organize the actual work you do each day and week.

### Two Views: Day and Week

Tabs at the top switch between:

#### Day View
Shows tasks for a single day. At the top:
- **Date display** with navigation arrows to move between days (e.g., "Sun, Mar 29" with < > arrows and a "Today" button to jump back)
- A date badge showing the full date (e.g., "03/29/2026")

Tasks are grouped by type:
- **Improve Tasks** — Proactive work that moves you toward your goals. Shown with a red/orange icon. These are the main tasks tied to your Goal Stack
- **Maintenance Tasks** — Routine operational work that keeps things running. Shown with a blue wrench icon

Each task card shows:
- Checkbox (to mark complete — turns green with strikethrough text and "DONE" badge)
- Task title
- Status badge (TODO, IN PROGRESS, DONE)
- Priority color dot (yellow = medium, red = high, etc.)
- Goal stack label (e.g., "Personal Stack")
- Due date
- An optional recurring/calendar icon if scheduled

#### Week View
Shows all tasks for the current week in a list, with day headers. Gives you a broader view of what's coming up across the week.

### Task States
- **TODO** — Not yet started (gray badge)
- **IN PROGRESS** — Currently being worked on
- **DONE** — Completed (green badge, strikethrough text)

### Creating a Task
The **"+ Quick Add"** button (available on Dashboard and Tasks) opens a task creation form where you specify: title, type (Improve or Maintenance), priority, due date, goal stack assignment, and description.

### How Tasks Connect to Goals
Every Improve task should be linked to a Weekly Goal in the Goal Stack. This creates the chain: HHG → 5-10 Year → Yearly → Monthly → Weekly Goal → Task. When you complete a task, you're making progress on your entire goal hierarchy.

### WIN THE DAY Feature
On the Weekly tab, a prominent **yellow banner** highlights your #1 highest-leverage task for the week. This is the "WIN THE DAY" feature — it identifies the single most impactful thing you can do and puts it front and center so you don't lose focus.

---

## 7. Reactive Tasks

**URL:** `/reactive-tasks/new`
**Purpose:** Handle unplanned, urgent work that interrupts your planned day — without losing structure.

### The CARS Framework

Reactive Tasks use a structured 4-step framework called **CARS**:

1. **C — Clarify:** What exactly is the issue? Define the problem clearly before acting
2. **A — Act:** Take the immediate necessary action to address the issue
3. **R — Resolve:** Ensure the issue is fully resolved, not just band-aided
4. **S — Systemize:** Create a process or system to prevent this from happening again

### How to Use It

When something unexpected comes up (a customer complaint, a server crash, an urgent request from your boss):

1. Click "Reactive Tasks" in the sidebar
2. You land on a form to create a new reactive task
3. Walk through each CARS step, filling in what you did at each stage
4. The task is logged so you can track how much of your time goes to reactive vs. proactive work

### Why It Matters

Most productivity systems ignore unplanned work. Prism acknowledges that reactive work is real and inevitable, but structures it so you can: (a) handle it systematically, (b) track how much disruption you face, and (c) turn recurring reactive issues into processes (the "Systemize" step connects to the Processes feature).

---

## 8. Ideas

**URL:** `/ideas`
**Purpose:** Capture ideas quickly and evaluate them objectively before committing resources.

### ICE Scoring

Every idea is scored on three dimensions:

- **I — Impact:** How much positive effect will this idea have if implemented? (Scale of 1-10)
- **C — Confidence:** How confident are you that this will work? (Scale of 1-10)
- **E — Ease:** How easy is it to implement? (Scale of 1-10)

The combined ICE score helps you prioritize which ideas to pursue first. High-impact, high-confidence, easy-to-implement ideas float to the top.

### How It Looks

The Ideas page shows a list of captured ideas, each displaying:
- Idea title/description
- Individual I, C, E scores
- Combined ICE score
- Sorting and filtering controls

### How to Use It

1. Whenever you have an idea (during a meeting, in the shower, while commuting), capture it immediately using the **"Add Idea"** button (available on Dashboard and Ideas page)
2. Score it with ICE when you have time to think about it
3. During your Weekly Review, look at your top-scored ideas and decide which to turn into tasks
4. Ideas that become tasks get moved into the Task system and linked to goals

---

## 9. Aims

**URL:** `/aims`
**Purpose:** Build and maintain daily and weekly habits (rituals) with streak tracking and growth-stage feedback.

### What Aims Are

Aims are recurring habits or rituals — things you want to do consistently, not one-off tasks. Examples: "Deep Work session every day," "Exercise 3x/week," "Read for 30 minutes daily."

### Two Types: Daily and Weekly

- **Daily Aims** — Things you do (or should do) every single day
- **Weekly Aims** — Things you do a certain number of times per week

### Growth Stages (Streak-Based)

As you maintain a streak for an aim, it progresses through growth stages represented by plant metaphors:

1. **SEED** (0-2 day streak) — Just starting out. Fragile. One missed day resets you
2. **SPROUT** (3-6 day streak) — Starting to take root. You're building momentum
3. **GROW** (7-13 day streak) — Solid habit forming. It's becoming part of your routine
4. **FLOW** (14+ day streak) — Fully established habit. You're in the groove

Each stage has a visual indicator (icon/color) so you can see at a glance how strong each habit is.

### Current Aims Example

From the live app:
- **Deep Work** — Daily aim, 14-day streak, **FLOW** stage (green, fully grown)
- **Active Recovery** — Daily aim, 7-day streak, **GROW** stage
- **Exercise** — Weekly aim, 3-day streak, **SPROUT** stage
- **Flow Activity** — Weekly aim, 1-day streak, **SEED** stage

### Attention Alerts

When aims are falling behind (streak about to break, or missed days), the app generates alerts:
- On the **Dashboard:** An orange banner "2 aims need attention (2 needs caution)"
- On the **Aims page:** Individual aim cards show warning indicators

### How to Use It

1. Define 3-5 core habits you want to build (don't overdo it)
2. Mark them as Daily or Weekly
3. Each day, check off the aims you completed
4. Watch your streaks grow and your growth stages advance
5. The streak counter in the sidebar footer is your cumulative streak across all aims

---

## 10. Calendar

**URL:** `/calendar`
**Purpose:** Visualize your week as a time-blocked schedule. See when tasks, aims, reviews, meetings, and Power Down are happening.

### Layout

The Calendar shows a **weekly view** with:
- Days as columns (Monday through Sunday)
- Hours as rows (typically 6am to 10pm)
- A **current time indicator** (red line) showing where you are right now
- Color-coded blocks for different item types

### Color-Coded Categories

The Calendar uses color coding to distinguish different types of scheduled items:
- **My Tasks** — Blue blocks for your planned tasks
- **Reviews** — Purple blocks for scheduled review sessions
- **Meetings** — A distinct color for meetings
- **Aims** — Blocks for scheduled aim/habit sessions
- **Google Calendar** — Synced events from your connected Google Calendar
- **Power Down** — A dedicated block (typically in the evening) for your shutdown ritual

Category filters at the top let you toggle which types are visible.

### Unscheduled Items Panel

On the right side (or below on mobile), an **Unscheduled Items** panel shows tasks that have a due date but no specific time slot. These appear as a list with:
- Task title
- Priority color indicator
- Due date

These can be **dragged and dropped** onto the calendar to schedule them at a specific time.

### How to Use It

1. During your Power Down or morning routine, open the Calendar
2. See what's already scheduled (meetings, recurring aims, reviews)
3. Drag unscheduled tasks from the panel onto available time slots
4. Adjust block durations by dragging edges
5. Use the category filters to focus on specific types (e.g., show only "My Tasks" to see your work blocks)

### Scheduling Capacity

The Dashboard shows "0h / 35h scheduled" — this tracks how many hours you've scheduled against a configurable weekly capacity (35 hours by default, adjustable in Settings).

---

## 11. Reviews

**URL:** `/reviews`
**Purpose:** Structured reflection at weekly, monthly, and yearly cadences. The mechanism that keeps you honest about progress and course-corrects.

### Three Cadences

Reviews operate on three timeframes, each with its own rhythm:

#### Weekly Review
- **Frequency:** Every week (e.g., every Sunday)
- **Purpose:** Look back on the week. What did you accomplish? What fell through? What should you prioritize next week?
- **Format:** A wizard-based flow that walks you through reflection prompts
- **Status display:** Shows "Next: Sun, Mar 29 (Today)" with a countdown format

#### Monthly Review
- **Frequency:** Once a month (e.g., first of each month)
- **Purpose:** Zoom out. Are your monthly goals on track? Do your weekly priorities align with monthly targets?
- **Status display:** Shows the next review date (e.g., "2026-04-01" — note: this date format is less friendly than the weekly format, which is a known inconsistency)

#### Yearly Review
- **Frequency:** Once a year
- **Purpose:** The big-picture check-in. Are you moving toward your HHG? What major adjustments are needed?
- **Status display:** Shows "Next: Thu, Jan 1 (278d)" with countdown in days

### Upcoming Reviews

The Reviews page shows an **Upcoming Reviews** section listing the next scheduled review for each cadence, along with any overdue reviews.

### Cadence Setup

A purple **"+ Set Up 1 Cadence"** button appears if any cadence hasn't been configured yet. Clicking it walks you through setting the schedule.

### Team Reviews

A **Team Reviews** tab shows:
- **Pending** count and **Completed** count
- A **"+ New Team Review"** button to create collaborative review sessions
- This enables managers to review progress with direct reports or teams

### Export

A blue **"Export"** button allows downloading review data for external use.

### Review Wizard

When you click to complete a review, a **multi-step wizard** guides you through the process. Each step includes reflection prompts, fields for noting wins/losses, and planning prompts for the next period.

### How to Use It

1. Set up your review cadences (weekly is most important to start)
2. When a review is due, the Dashboard and Reviews page will prompt you
3. Walk through the wizard honestly — this is where you identify what's working and what isn't
4. Use insights from reviews to adjust your Goal Stack, reprioritize tasks, and modify aims
5. Monthly and yearly reviews are deeper versions of the same process

---

## 12. Power Down

**URL:** `/power-down`
**Purpose:** An evening shutdown ritual that closes out your day and sets up tomorrow. Dark-themed to signal "winding down."

### What It Is

Power Down is Prism's signature feature — a structured end-of-day routine that ensures you don't just stop working, you *close out* intentionally. It's inspired by Cal Newport's "shutdown complete" concept.

### Visual Design

The Power Down page uses a **dark theme** (dark background, light text) regardless of your app-wide theme setting. This is deliberate — it visually signals that you're transitioning from "work mode" to "rest mode." A moon icon reinforces the nighttime association.

### Multi-Step Wizard

Power Down is a wizard with multiple steps. Each step walks you through a part of the shutdown ritual:

**Step 1: Review Today**
- What did you accomplish today?
- Review your completed and incomplete tasks
- Note any outstanding items

**Step 2: Select Top Tasks for Tomorrow**
- Choose your top priority tasks for the next day
- These will appear as "Top Tasks" on tomorrow's Dashboard
- This is the connection point — why the Dashboard says "No top tasks selected yet. Complete a Power Down to set your priorities."

**Step 3: Plan Tomorrow's Schedule**
- Time-block tomorrow's tasks on the calendar
- Assign specific hours to your priorities

**Step 4: Shutdown Complete**
- Final confirmation that you're done for the day
- Closing affirmation or reflection prompt

### State Persistence

The wizard **remembers your progress** — if you navigate away mid-wizard and come back later, it picks up where you left off. This prevents losing your work if you get interrupted during Power Down.

### How to Use It

1. At the end of your work day (configurable time in Settings), open Power Down
2. Walk through each step honestly
3. Select your top tasks for tomorrow — this is the most important step
4. Close out your day knowing tomorrow is already planned
5. The selected top tasks will appear on tomorrow's Dashboard as your priority focus

### Scheduling

In Settings, you can configure your **Powerdown Time** — the time of day when the Power Down block appears on your Calendar (e.g., 6:00 PM). The Dashboard also shows a Power Down launcher section at the bottom of the Daily view.

---

## 13. Leaderboard

**URL:** `/leaderboard`
**Purpose:** Gamification — see how you and your team rank based on productivity scores.

### Scoring System

The Leaderboard ranks users by total points, broken down into four categories:

- **Streak Points** — Earned by maintaining your daily aim streaks. Longer streaks = more points
- **Task Points** — Earned by completing tasks. Different task types may earn different amounts
- **Review Points** — Earned by completing reviews on schedule
- **Aim Points** — Earned by completing aims consistently

### Current Rankings

From the live app:
1. **Munder** (Admin) — 260 points (#1)
2. **James Wilson** — 13 points (#2)
3. **Sarah Chen** — 0 points (#3, newly added)

### How It Looks

A ranked list showing each user with:
- Rank number and position indicator
- User name and role
- Total score prominently displayed
- Breakdown of score by category (streak, tasks, reviews, aim pts)
- Visual differentiation for the top position

### How to Use It

The Leaderboard is primarily a motivational tool. It creates friendly competition within a team and rewards consistent engagement with the system. The scoring rewards not just output (tasks completed) but also process (reviews done) and consistency (streaks maintained).

---

## 14. Reports & Export

**URL:** `/reports`
**Purpose:** Data analysis and export across all Prism modules. See historical data, identify trends, and export for external analysis.

### Four Tabs

The Reports page has four tabs:

#### Reviews Tab
- Lists all completed reviews (Weekly, Monthly, Yearly)
- Shows review date, type, and completion status
- Export functionality via the "Export" button

#### Tasks Tab
- Lists all tasks with columns: Task Name, Type, Status, Created Date, Completed Date
- Completed tasks show the completion date in human-readable format (e.g., "Mar 27, 2026")
- Tasks in "To Do" status show "—" for Completed Date
- Sortable and filterable

#### AIMs Tab
- Shows aim history, streaks, and completion data
- Track which aims are growing and which are stalling

#### Goals Tab
- Shows goal progress across the Goal Stack hierarchy
- Track completion rates at each level

### Export Functionality

- **CSV Export** — Download data as comma-separated values for spreadsheet analysis
- **JSON Export** — Download raw data for programmatic processing
- Export buttons are available on each tab

### How to Use It

1. Use Reports during your Monthly or Yearly reviews to see trends
2. Export task data to analyze your productivity patterns (which days are most productive? which task types dominate?)
3. Use Aims data to identify which habits are sticking and which aren't
4. Compare goal progress against targets to identify gaps

---

## 15. Processes

**URL:** `/processes`
**Purpose:** Map your business functions and the processes within them. The "Systemize" step of the CARS framework connects here.

### Structure: Functions → Processes

The Processes section uses a two-level hierarchy:

1. **Functions** — High-level business areas (e.g., "Market," "Sales," "Operations")
2. **Processes** — Specific repeatable workflows within each function (e.g., under "Market": "Content Creation Process," "Social Media Publishing Process")

### Current State

From the live app: One function called "Market" with 0 processes defined. This feature appears to be in early adoption — the structure is in place but processes haven't been populated yet.

### How to Use It

1. Define your key business functions (the major areas of your work/business)
2. Under each function, document the specific processes
3. When a Reactive Task's "Systemize" step identifies a need for a new process, create it here
4. Eventually, this becomes your operational playbook — every repeatable workflow documented

### Future: Process-Level KPIs

A feature request from Round 1 evaluation: attach KPIs (Key Performance Indicators) directly to processes so you can measure not just *if* a process exists but *how well* it's performing.

---

## 16. Settings

**URL:** `/settings`
**Purpose:** Configure all aspects of Prism to match your preferences and work style.

### Settings Sections

#### Appearance
- **Theme toggle:** Light / Dark / System (follows OS preference)
- Currently set to "Light" by default

#### Visible Features
- Toggle switches for every sidebar feature: Goal Stack, Training, Tasks, Ideas, Aims, Calendar, Reviews, Power Down, Leaderboard, Reports, Processes
- Each toggle controls whether that feature appears in the sidebar navigation
- Hidden features are still accessible via direct URL
- A **"Save"** button applies changes

#### MTP (Massive Transformative Purpose)
- A field for defining your overarching purpose — the "why" behind everything you do
- This is the philosophical foundation that sits above even the HHG

#### Timezone
- Set your local timezone for accurate date/time display across the app

#### Notifications
- Configure notification preferences (email, in-app, frequency)

#### Scheduling
- **Weekly capacity hours** — How many hours per week you want to schedule (default: 35h)
- This drives the "0h / 35h scheduled" capacity bar on the Dashboard

#### Connected Calendars
- Connect external calendars (Google Calendar) to sync events into Prism's Calendar view
- Connected events appear as color-coded blocks alongside your Prism tasks

#### Powerdown Time
- Set the time of day for your Power Down ritual (e.g., 6:00 PM)
- This determines when the Power Down block appears on the Calendar

#### Admin Panel
- Visible to Admin users only
- **"Create User (Dev)"** section — Allows creating new user accounts (currently appears to be a development/testing feature)

---

## 17. Daily Workflow — How It All Connects

Here is how a Prism power user moves through a typical day. This is the intended workflow that ties all features together:

### Morning Routine

1. **Open Dashboard (Daily view)** — See your greeting, today's date, and the tasks selected during last night's Power Down as your "Top Tasks"
2. **Check the Aims alert** — See if any habits need attention today
3. **Glance at Today's Schedule** — See your time-blocked day
4. **Start working on your #1 top task**

### During the Day

5. **Complete tasks** — Check them off on the Dashboard or Tasks page. Watch the progress bar fill
6. **Handle interruptions** — When reactive work hits, go to **Reactive Tasks** and log it with the CARS framework instead of just reacting blindly
7. **Capture ideas** — Hit **"Add Idea"** on the Dashboard whenever something pops into your head. Score it with ICE later
8. **Track your aims** — After your Deep Work session, mark it done in Aims. After your workout, mark it done. Watch streaks grow

### End of Day

9. **Open Power Down** — The dark-themed wizard guides you through shutting down
10. **Review today** — What got done? What didn't? Log it
11. **Select tomorrow's top tasks** — This is the crucial step. Decide what matters most
12. **Plan tomorrow's schedule** — Time-block the top tasks
13. **Shutdown complete** — Close the laptop with a clear mind. Tomorrow is already planned

### Weekly Cadence

14. **Weekly Review** — Walk through the review wizard. Reflect on the week. Adjust next week's goals
15. **Check Leaderboard** — See how you're trending against the team
16. **Review Goal Stack** — Are weekly goals aligned with monthly targets? Adjust if needed
17. **Plan next week** — Use Calendar to time-block the upcoming week

### Monthly/Yearly Cadence

18. **Monthly Review** — Zoom out. Check monthly goals against yearly. Adjust the stack
19. **Check Reports** — Export data, analyze trends, identify what's working
20. **Yearly Review** — The big check-in. Am I moving toward my HHG? What needs to change fundamentally?

### The Virtuous Loop

The system creates a feedback loop:
- **Goals** tell you what matters → **Tasks** tell you what to do → **Calendar** tells you when → **Aims** build the habits → **Reviews** confirm you're on track → **Power Down** prepares tomorrow → **Dashboard** starts you fresh each morning

Everything connects. Nothing lives in isolation.

---

## 18. Key Concepts Glossary

| Term | Definition |
|------|-----------|
| **HHG** | High Hard Goal — your ultimate long-term ambition at the top of the Goal Stack |
| **Goal Stack** | The cascading hierarchy: HHG → 5-10 Year → Yearly → Monthly → Weekly |
| **Improve Task** | A proactive task that moves you toward a goal (the primary task type) |
| **Maintenance Task** | A routine/operational task that keeps things running |
| **Reactive Task** | Unplanned urgent work, structured using the CARS framework |
| **CARS** | Clarify → Act → Resolve → Systemize — framework for handling reactive work |
| **ICE Score** | Impact × Confidence × Ease — scoring system for evaluating ideas |
| **Aim** | A recurring habit/ritual tracked with streaks (Daily or Weekly) |
| **Growth Stages** | SEED → SPROUT → GROW → FLOW — streak-based habit maturity levels |
| **Power Down** | Evening shutdown ritual: review today, plan tomorrow, shutdown complete |
| **Top Tasks** | Priority tasks for tomorrow, selected during Power Down |
| **Review Cadence** | Structured reflection cycles: Weekly, Monthly, Yearly |
| **MTP** | Massive Transformative Purpose — your overarching "why" |
| **KPI** | Key Performance Indicator — measurable targets attached to goals |
| **WIN THE DAY** | Feature highlighting your single highest-leverage task for the week |
| **Streak** | Consecutive days/weeks of completing an aim; drives growth stages and Leaderboard points |
| **Functions & Processes** | Business area hierarchy for documenting repeatable workflows |
| **Visible Features** | Settings toggles controlling which features appear in the sidebar |
| **Focus Mode** | Compact Dashboard view showing essentials only |
| **Full View** | Expanded Dashboard view with all sections visible |

---

*This document reflects the state of Prism as of March 29, 2026, based on three rounds of live evaluation. The app is actively being developed and improved.*
