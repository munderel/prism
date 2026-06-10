# Prism — Goal-Oriented Productivity System

A comprehensive team productivity platform that connects long-term vision to daily execution. Prism combines cascading goal hierarchies, task management, habit tracking, calendar scheduling, structured reviews, and gamification into a single integrated system.

**Core loop:** Set goals &rarr; Break into tasks &rarr; Execute daily &rarr; Build habits &rarr; Review progress &rarr; Repeat.

## Key Features

- **Goal Stack** — 5-level cascading hierarchy (High Hard Goal &rarr; Strategic &rarr; Monthly &rarr; Weekly &rarr; Daily) with KPIs and YAML import/export
- **4 Task Types** — Improve (goal work), React (unplanned, CARS framework), Maintenance (operations), Review (rituals)
- **AIMs** — Daily/weekly habit tracking with 4 growth phases (Seed &rarr; Sprout &rarr; Grow &rarr; Flow), streaks, and derail detection
- **Review Wizards** — Weekly (11-step), Monthly (9-step), and Yearly structured reflection rituals
- **Power Down** — 9-step evening shutdown ritual for closing out the day and planning tomorrow
- **Calendar** — FullCalendar with Google Calendar sync, drag-and-drop scheduling, split view
- **Process KPIs** — Business process mapping with KPI tracking, projections, and time-level goals
- **Gamification** — Leaderboard, streaks, public wins, celebration animations
- **AI Features** — Quiz generation, task suggestions, task decomposition (via OpenRouter)
- **Command Palette** — Global search across all entities (Cmd+K)

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript | 5.x |
| UI | React | 18.x |
| Database | PostgreSQL + Prisma ORM | Prisma 7.5 |
| Auth | NextAuth (JWT strategy) | 4.24.13 |
| Styling | Tailwind CSS | 3.4.1 |
| Data Fetching | SWR | 2.4.1 |
| Calendar | FullCalendar + Google Calendar API | 6.1.20 |
| Charts | Recharts | 3.8.0 |
| Animations | Framer Motion | 12.38.0 |
| Testing | Vitest + React Testing Library | 4.1.0 |
| AI | OpenRouter (Llama 3 70B) | — |
| Drag & Drop | dnd-kit | 6.3.1 |
| Icons | Lucide React | 0.577.0 |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker)
- Google Cloud project with Calendar API enabled (for calendar sync)
- Optional: OpenRouter API key (for AI features)

### Setup

```bash
# Clone and install
cd goal-dashboard
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL, NextAuth secret, Google OAuth credentials, etc.

# Set up database
npx prisma db push       # Create tables (development)
npx prisma db seed        # Seed default data (AIM categories, review templates)

# Enable passwordless dev login
# Set NEXT_PUBLIC_DEV_LOGIN=true in .env

# Start development server
npm run dev
# Open http://localhost:3000
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup (Vercel, env vars, Google Cloud, SMTP, VAPID keys).

## Project Structure

```
goal-dashboard/
├── src/
│   ├── app/
│   │   ├── (app)/              # Authenticated pages (dashboard, goals, tasks, etc.)
│   │   ├── (auth)/             # Public pages (login, accept-invite)
│   │   └── api/                # 130+ API route handlers
│   ├── components/             # 100+ React components organized by feature
│   │   ├── aims/               # Habit tracking UI
│   │   ├── calendar/           # Calendar views and scheduling
│   │   ├── dashboard/          # Dashboard widgets
│   │   ├── dopamine/           # Gamification animations
│   │   ├── goals/              # Goal stack tree and editors
│   │   ├── layout/             # Sidebar, TopBar, MainLayout
│   │   ├── powerdown/          # Evening ritual wizard
│   │   ├── reviews/            # Review wizards (weekly/monthly/yearly)
│   │   ├── tasks/              # Task cards, lists, editors
│   │   └── ui/                 # Shared UI primitives
│   ├── lib/                    # 30+ utility modules (auth, dates, scheduling, etc.)
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript declarations
│   └── test/                   # Test setup, mocks, fixtures
├── prisma/
│   ├── schema.prisma           # 58 models, 18 enums
│   ├── seed.ts                 # Database seeding
│   └── migrations/             # 75+ migration files
└── public/                     # Static assets
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | App URL (e.g., `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | Session signing key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `CRON_SECRET` | Yes | Cron endpoint authentication |
| `TOKEN_ENCRYPTION_KEY` | Yes | 64-char hex for AES-256-GCM token encryption |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | For email | SMTP configuration |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | For push | Web push notification keys |
| `OPENROUTER_API_KEY` | For AI | OpenRouter API key |
| `NEXT_PUBLIC_DEV_LOGIN` | Dev only | Set `true` for passwordless local login |

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions for each service.

## Documentation

| Document | Description |
|----------|-------------|
| [Prism_How_It_Works.md](Prism_How_It_Works.md) | Comprehensive feature guide (user perspective) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, auth flow, integrations |
| [API-REFERENCE.md](API-REFERENCE.md) | All 130+ API endpoints with request/response schemas |
| [DATABASE.md](DATABASE.md) | Data model documentation (58 models, 18 enums, relationships) |
| [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) | Local setup, conventions, patterns, adding features |
| [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) | Architecture Decision Records (12 ADRs) |
| [TESTING.md](TESTING.md) | Test strategy, running tests, writing tests |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment checklist and env var guide |
