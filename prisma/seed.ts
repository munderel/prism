import {
  PrismaClient,
  Prisma,
  ReviewType,
  GoalLevel,
  GoalStatus,
  TaskStatus,
  TaskPriority,
  InvitationStatus,
  IdeaStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://goaldash:goaldash@localhost:5433/goaldash';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed ReviewTemplates
  const templates = [
    {
      reviewType: ReviewType.WEEKLY,
      checklistItems: [
        { title: 'Review all weekly goals', description: 'Check progress on each weekly goal in your stack' },
        { title: 'Update blocked items', description: 'Identify and document any blockers' },
        { title: 'Reprioritize for next week', description: 'Adjust priorities based on progress and new information' },
        { title: 'Check maintenance tasks', description: 'Review recurring tasks — any to automate or eliminate?' },
        { title: 'Update goal progress', description: 'Set accurate progress percentages for each goal' },
      ],
      processSteps: [
        { title: 'Open your goal stack', description: 'Navigate to your goal stack and expand all weekly goals' },
        { title: 'Check progress on each weekly goal', description: 'For each goal, assess: on track, behind, or ahead?' },
        { title: 'Identify blockers', description: 'Note anything preventing progress and create react tasks if needed' },
        { title: 'Adjust priorities', description: 'Reorder goals based on what matters most this week' },
        { title: 'Set next week focus', description: 'Pick the top 3 goals to focus on next week' },
      ],
    },
    {
      reviewType: ReviewType.MONTHLY,
      checklistItems: [
        { title: 'Review monthly goals', description: 'Assess progress on all monthly goals' },
        { title: 'Review strategic alignment', description: 'Are monthly goals still aligned with strategic goals?' },
        { title: 'Check goal links', description: 'Verify individual goals are properly linked to company goals' },
        { title: 'Assess task type balance', description: 'Review ratio of goal-stack vs react vs maintenance tasks' },
        { title: 'Update strategy if needed', description: 'Adjust strategic goals based on monthly learnings' },
        { title: 'Plan next month', description: 'Break strategic goals into monthly goals for next month' },
      ],
      processSteps: [
        { title: 'Review last month metrics', description: 'Check completion rate, failure rate, and streak history' },
        { title: 'Assess each monthly goal', description: 'Mark completed, adjust in-progress, flag abandoned' },
        { title: 'Strategic alignment check', description: 'Do monthly goals still serve the strategic goals above them?' },
        { title: 'Rebalance', description: 'If too many react tasks, investigate root causes' },
        { title: 'Set next month goals', description: 'Create or adjust monthly goals for the coming month' },
      ],
    },
    {
      reviewType: ReviewType.YEARLY,
      checklistItems: [
        { title: 'Annual retrospective', description: 'Full year review — achievements, failures, surprises' },
        { title: 'HHG assessment', description: 'Is the High Hard Goal still the right goal? Adjust or replace' },
        { title: 'MTP review', description: 'Revisit your Massively Transformative Purpose' },
        { title: 'Company MTP review', description: 'Review and update company MTP with the team' },
        { title: 'Full stack rebuild', description: 'Rebuild goal stack from HHG down for the new year' },
        { title: 'Set annual targets', description: 'Define the year\'s strategic goals and success metrics' },
      ],
      processSteps: [
        { title: 'Year in review', description: 'Walk through each quarter\'s highlights and lowlights' },
        { title: 'Goal completion analysis', description: 'What % of goals were completed? Which types failed most?' },
        { title: 'Purpose check', description: 'Does your MTP still resonate? Has it evolved?' },
        { title: 'Vision setting', description: 'What does success look like at the end of this new year?' },
        { title: 'New goal stack', description: 'Build the fresh goal stack from scratch or revise existing' },
      ],
    },
  ];

  for (const template of templates) {
    await prisma.reviewTemplate.upsert({
      where: {
        reviewType_isTeamTemplate: {
          reviewType: template.reviewType,
          isTeamTemplate: false,
        },
      },
      update: {
        checklistItems: template.checklistItems,
        processSteps: template.processSteps,
      },
      create: template,
    });
  }

  // Seed default CompanySettings
  const existing = await prisma.companySettings.findFirst();
  if (!existing) {
    await prisma.companySettings.create({
      data: { companyMtp: null },
    });
  }

  // Seed default admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@upwhiten.com' },
    update: { isAdmin: true },
    create: {
      email: 'admin@upwhiten.com',
      name: 'Munder (Admin)',
      isAdmin: true,
    },
  });

  // Seed default AimCategories
  const aimCategories: Array<{
    name: string;
    description: string;
    defaultFrequency: number;
    defaultDurationMin: number;
    isGroupable: boolean;
    isDefault: boolean;
    isDaily: boolean;
    activities: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    schedulePeriod: string;
  }> = [
    {
      name: 'Deep Work',
      description: 'Focused, uninterrupted work session on your most important task',
      defaultFrequency: 7, // daily
      defaultDurationMin: 90,
      isGroupable: false,
      isDefault: true,
      isDaily: true,
      activities: Prisma.JsonNull,
      schedulePeriod: 'working',
    },
    {
      name: 'Flow Activity',
      description: 'Engaging in an activity that produces a flow state',
      defaultFrequency: 2,
      defaultDurationMin: 180,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: ['painting', 'music', 'surfing', 'writing', 'coding', 'woodworking', 'climbing'],
      schedulePeriod: 'casual',
    },
    {
      name: 'Exercise',
      description: 'Physical training session — strength, cardio, or sport',
      defaultFrequency: 3,
      defaultDurationMin: 60,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: ['strength', 'cardio', 'sport', 'HIIT', 'swimming', 'cycling', 'running'],
      schedulePeriod: 'casual',
    },
    {
      name: 'Active Recovery',
      description: 'Low-intensity recovery activities to support performance',
      defaultFrequency: 3,
      defaultDurationMin: 30,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: ['sauna', 'massage', 'mindfulness', 'light yoga'],
      schedulePeriod: 'casual',
    },
    {
      name: 'Train Weakness',
      description: 'Deliberate practice targeting your biggest skill gap',
      defaultFrequency: 1,
      defaultDurationMin: 45,
      isGroupable: false,
      isDefault: true,
      isDaily: false,
      activities: Prisma.JsonNull,
      schedulePeriod: 'working',
    },
    {
      name: 'Get Feedback',
      description: 'Seek specific feedback from peers, mentors, or customers',
      defaultFrequency: 1,
      defaultDurationMin: 45,
      isGroupable: false,
      isDefault: true,
      isDaily: false,
      activities: Prisma.JsonNull,
      schedulePeriod: 'working',
    },
    {
      name: 'Social Support',
      description: 'Meaningful social connection — dinner, call, or group activity',
      defaultFrequency: 1,
      defaultDurationMin: 120,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: Prisma.JsonNull,
      schedulePeriod: 'casual',
    },
  ];

  for (const cat of aimCategories) {
    const id = cat.name.toLowerCase().replace(/\s+/g, '-');
    const data = {
      name: cat.name,
      description: cat.description,
      defaultFrequency: cat.defaultFrequency,
      defaultDurationMin: cat.defaultDurationMin,
      isGroupable: cat.isGroupable,
      isDefault: cat.isDefault,
      isDaily: cat.isDaily,
      activities: cat.activities,
      schedulePeriod: cat.schedulePeriod,
    };
    await prisma.aimCategory.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  // ============================================================
  // SECTION 1: Team Members
  // ============================================================
  const sarah = await prisma.user.upsert({
    where: { email: 'sarah@upwhiten.com' },
    update: { name: 'Sarah Chen' },
    create: {
      email: 'sarah@upwhiten.com',
      name: 'Sarah Chen',
      isAdmin: false,
    },
  });

  const james = await prisma.user.upsert({
    where: { email: 'james@upwhiten.com' },
    update: { name: 'James Wilson' },
    create: {
      email: 'james@upwhiten.com',
      name: 'James Wilson',
      isAdmin: false,
    },
  });

  // ============================================================
  // SECTION 2: Goal Stack with Full Hierarchy
  // ============================================================
  // Helper: get the Monday of the week containing a date
  function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1
    date.setUTCDate(date.getUTCDate() + diff);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  // Helper: create a Date at a specific UTC hour/minute on a given day
  function timeBlock(base: Date, hours: number, minutes: number): Date {
    const d = new Date(base);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  // Create (or find) the personal goal stack
  const stack = (await prisma.goalStack.findFirst({
    where: { ownerId: adminUser.id, name: 'Personal Stack' },
  })) ?? (await prisma.goalStack.create({
    data: {
      ownerId: adminUser.id,
      name: 'Personal Stack',
      visibility: 'private',
      weekStartDay: 1, // Monday
    },
  }));

  // --- HHG ---
  const hhg = await prisma.goal.upsert({
    where: { id: 'seed-hhg-30-35-locations' },
    update: {
      title: 'Reach 30-35 Locations / $35M Revenue',
      status: GoalStatus.IN_PROGRESS,
      progressPct: 24,
    },
    create: {
      id: 'seed-hhg-30-35-locations',
      stackId: stack.id,
      level: GoalLevel.HIGH_HARD,
      title: 'Reach 30-35 Locations / $35M Revenue',
      description: 'Scale UpWhiten to 30-35 locations generating $35M in household goods revenue.',
      status: GoalStatus.IN_PROGRESS,
      progressPct: 24,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2028-12-31'),
      sortOrder: 0,
    },
  });

  // --- Yearly Goals ---
  const yearlyGoals: Array<{
    id: string; title: string; year: number;
    status: typeof GoalStatus[keyof typeof GoalStatus]; progressPct: number;
  }> = [
    { id: 'seed-yearly-2025', title: 'Year 1 (2025): Foundation & First 10 Locations', year: 2025, status: GoalStatus.IN_PROGRESS, progressPct: 40 },
    { id: 'seed-yearly-2026', title: 'Year 2 (2026): Scale to 20 Locations', year: 2026, status: GoalStatus.IN_PROGRESS, progressPct: 15 },
    { id: 'seed-yearly-2027', title: 'Year 3 (2027): Reach 30+ Locations', year: 2027, status: GoalStatus.NOT_STARTED, progressPct: 0 },
  ];

  const yearlyGoalRecords: Record<string, typeof hhg> = {};
  for (const yg of yearlyGoals) {
    yearlyGoalRecords[yg.id] = await prisma.goal.upsert({
      where: { id: yg.id },
      update: { title: yg.title, status: yg.status, progressPct: yg.progressPct },
      create: {
        id: yg.id,
        stackId: stack.id,
        parentId: hhg.id,
        level: GoalLevel.STRATEGIC,
        title: yg.title,
        status: yg.status,
        progressPct: yg.progressPct,
        startDate: new Date(`${yg.year}-01-01`),
        endDate: new Date(`${yg.year}-12-31`),
        sortOrder: yg.year - 2025,
      },
    });
  }

  // --- Monthly Goals ---
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Helper to create monthly goals for a year
  async function createMonthlyGoals(yearlyGoalId: string, year: number) {
    const records: Record<string, typeof hhg> = {};
    for (let m = 0; m < 12; m++) {
      const monthId = `seed-monthly-${year}-${String(m + 1).padStart(2, '0')}`;
      const startDate = new Date(Date.UTC(year, m, 1));
      const endDate = new Date(Date.UTC(year, m + 1, 0)); // last day of month
      const now = new Date();
      const isCurrentOrPast = year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth());
      const isCurrent = year === now.getFullYear() && m === now.getMonth();
      let status: typeof GoalStatus[keyof typeof GoalStatus] = GoalStatus.NOT_STARTED;
      let progressPct = 0;
      if (isCurrentOrPast && !isCurrent) {
        status = GoalStatus.COMPLETED;
        progressPct = 100;
      } else if (isCurrent) {
        status = GoalStatus.IN_PROGRESS;
        progressPct = Math.round((now.getDate() / endDate.getDate()) * 100);
      }

      records[monthId] = await prisma.goal.upsert({
        where: { id: monthId },
        update: { title: `${monthNames[m]} ${year}`, status, progressPct },
        create: {
          id: monthId,
          stackId: stack.id,
          parentId: yearlyGoalId,
          level: GoalLevel.MONTHLY,
          title: `${monthNames[m]} ${year}`,
          status,
          progressPct,
          startDate,
          endDate,
          sortOrder: m,
        },
      });
    }
    return records;
  }

  // 2025 monthly goals
  const monthly2025 = await createMonthlyGoals('seed-yearly-2025', 2025);
  // 2026 monthly goals
  const monthly2026 = await createMonthlyGoals('seed-yearly-2026', 2026);
  // 2027 monthly goals (just shells)
  const monthly2027 = await createMonthlyGoals('seed-yearly-2027', 2027);

  // --- Weekly Goals (only for current month March 2026 + next month April 2026) ---
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Generate weekly goals for a given month
  async function createWeeklyGoals(monthlyGoalId: string, year: number, month: number, count: number) {
    const records: typeof hhg[] = [];
    // Start from the first Monday on or after month start
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    let weekStart = getMonday(monthStart);
    // If Monday is before month start, move to next Monday
    if (weekStart < monthStart) {
      weekStart = new Date(weekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() + 7);
    }

    for (let w = 0; w < count && weekStart <= monthEnd; w++) {
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const weekId = `seed-weekly-${year}-${String(month + 1).padStart(2, '0')}-w${w + 1}`;
      const isPast = weekEnd < now;
      const isCurrent = weekStart <= now && now <= weekEnd;

      let status: typeof GoalStatus[keyof typeof GoalStatus];
      let progressPct: number;
      if (isPast) {
        status = GoalStatus.COMPLETED;
        progressPct = 100;
      } else if (isCurrent) {
        status = GoalStatus.IN_PROGRESS;
        progressPct = 50;
      } else {
        status = GoalStatus.NOT_STARTED;
        progressPct = 0;
      }

      const title = `Week ${w + 1} of ${monthNames[month]} ${year}`;
      const goal = await prisma.goal.upsert({
        where: { id: weekId },
        update: { title, status, progressPct },
        create: {
          id: weekId,
          stackId: stack.id,
          parentId: monthlyGoalId,
          level: GoalLevel.WEEKLY,
          title,
          status,
          progressPct,
          startDate: weekStart,
          endDate: weekEnd,
          sortOrder: w,
        },
      });
      records.push(goal);

      weekStart = new Date(weekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() + 7);
    }
    return records;
  }

  // Lookup monthly goals by year
  const monthlyGoalsByYear: Record<number, Record<string, typeof hhg>> = {
    2025: monthly2025,
    2026: monthly2026,
    2027: monthly2027,
  };

  function getMonthlyGoals(year: number): Record<string, typeof hhg> {
    return monthlyGoalsByYear[year] ?? {};
  }

  // Current month weekly goals (up to 3)
  const currentMonthKey = `seed-monthly-${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const currentMonthGoals = getMonthlyGoals(currentYear);
  if (currentMonthGoals[currentMonthKey]) {
    await createWeeklyGoals(currentMonthGoals[currentMonthKey].id, currentYear, currentMonth, 3);
  }

  // Next month weekly goals (up to 2)
  const nextMonth = (currentMonth + 1) % 12;
  const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  const nextMonthKey = `seed-monthly-${nextMonthYear}-${String(nextMonth + 1).padStart(2, '0')}`;
  const nextMonthGoals = getMonthlyGoals(nextMonthYear);
  if (nextMonthGoals[nextMonthKey]) {
    await createWeeklyGoals(nextMonthGoals[nextMonthKey].id, nextMonthYear, nextMonth, 2);
  }

  // ============================================================
  // SECTION 2B: Company Goal Stack
  // ============================================================
  const companyStack = (await prisma.goalStack.findFirst({
    where: { ownerId: adminUser.id, name: 'UpWhiten Company Goals' },
  })) ?? (await prisma.goalStack.create({
    data: {
      ownerId: adminUser.id,
      name: 'UpWhiten Company Goals',
      isCompany: true,
      visibility: 'company',
      weekStartDay: 1,
    },
  }));

  // Company HHG
  const companyHhg = await prisma.goal.upsert({
    where: { id: 'seed-company-hhg' },
    update: { title: 'Become the #1 household goods moving company in North America' },
    create: {
      id: 'seed-company-hhg',
      stackId: companyStack.id,
      level: GoalLevel.HIGH_HARD,
      title: 'Become the #1 household goods moving company in North America',
      description: 'Achieve market leadership through exceptional service quality, strategic location expansion, and technology-driven operations.',
      status: GoalStatus.IN_PROGRESS,
      progressPct: 18,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2030-12-31'),
      sortOrder: 0,
    },
  });

  // Company yearly goal
  await prisma.goal.upsert({
    where: { id: 'seed-company-yearly-2026' },
    update: { title: 'Scale operations to 20 locations with 95% customer satisfaction' },
    create: {
      id: 'seed-company-yearly-2026',
      stackId: companyStack.id,
      parentId: companyHhg.id,
      level: GoalLevel.STRATEGIC,
      title: 'Scale operations to 20 locations with 95% customer satisfaction',
      status: GoalStatus.IN_PROGRESS,
      progressPct: 25,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      sortOrder: 0,
    },
  });

  // Company monthly goal
  await prisma.goal.upsert({
    where: { id: 'seed-company-monthly-q1' },
    update: { title: 'Launch 3 new locations in Southeast region' },
    create: {
      id: 'seed-company-monthly-q1',
      stackId: companyStack.id,
      parentId: 'seed-company-yearly-2026',
      level: GoalLevel.MONTHLY,
      title: 'Launch 3 new locations in Southeast region',
      status: GoalStatus.IN_PROGRESS,
      progressPct: 33,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
      sortOrder: 0,
    },
  });

  // Company KPIs
  await prisma.kpi.upsert({
    where: { goalId_name: { goalId: companyHhg.id, name: 'Market Share' } },
    update: { targetValue: 15, actualValue: 4.2 },
    create: {
      goalId: companyHhg.id,
      name: 'Market Share',
      type: 'NUMERIC',
      unit: '%',
      targetValue: 15,
      actualValue: 4.2,
    },
  });

  await prisma.kpi.upsert({
    where: { goalId_name: { goalId: 'seed-company-yearly-2026', name: 'Customer Satisfaction' } },
    update: { targetValue: 95, actualValue: 91 },
    create: {
      goalId: 'seed-company-yearly-2026',
      name: 'Customer Satisfaction',
      type: 'NUMERIC',
      unit: '%',
      targetValue: 95,
      actualValue: 91,
    },
  });

  // ============================================================
  // SECTION 3: KPIs
  // ============================================================
  // KPI on HHG: Revenue
  await prisma.kpi.upsert({
    where: { goalId_name: { goalId: hhg.id, name: 'Revenue' } },
    update: { targetValue: 35000000, actualValue: 8500000 },
    create: {
      goalId: hhg.id,
      name: 'Revenue',
      type: 'NUMERIC',
      unit: 'USD',
      targetValue: 35000000,
      actualValue: 8500000,
    },
  });

  // KPI on Yearly Goal 1: Locations Opened
  await prisma.kpi.upsert({
    where: { goalId_name: { goalId: yearlyGoalRecords['seed-yearly-2025'].id, name: 'Locations Opened' } },
    update: { targetValue: 10, actualValue: 4 },
    create: {
      goalId: yearlyGoalRecords['seed-yearly-2025'].id,
      name: 'Locations Opened',
      type: 'NUMERIC',
      unit: 'locations',
      targetValue: 10,
      actualValue: 4,
    },
  });

  // KPI on current month: New Clients
  if (currentMonthGoals[currentMonthKey]) {
    await prisma.kpi.upsert({
      where: { goalId_name: { goalId: currentMonthGoals[currentMonthKey].id, name: 'New Clients' } },
      update: { targetValue: 5, actualValue: 2 },
      create: {
        goalId: currentMonthGoals[currentMonthKey].id,
        name: 'New Clients',
        type: 'NUMERIC',
        unit: 'clients',
        targetValue: 5,
        actualValue: 2,
      },
    });
  }

  // ============================================================
  // SECTION 4: Tasks (8-10 tasks)
  // ============================================================
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
  const thisWeekFriday = new Date(today);
  thisWeekFriday.setUTCDate(thisWeekFriday.getUTCDate() + (5 - today.getUTCDay() + 7) % 7);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Use a stable ID approach: upsert by id
  const taskSeeds = [
    {
      id: 'seed-task-improve-done',
      ownerId: adminUser.id,
      taskType: 'IMPROVE' as const,
      title: 'Finalize Q1 location lease agreements',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      goalId: currentMonthGoals[currentMonthKey]?.id,
      estimatedMinutes: 120,
      dueDate: yesterday,
      completedAt: yesterday,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-improve-inprogress',
      ownerId: adminUser.id,
      taskType: 'IMPROVE' as const,
      title: 'Build Snowflake baseline dashboard for revenue tracking',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      goalId: currentMonthGoals[currentMonthKey]?.id,
      estimatedMinutes: 180,
      dueDate: thisWeekFriday,
      startedAt: yesterday,
      isWinTheDay: true,
      timeBlockStart: timeBlock(today, 9, 0),
      timeBlockEnd: timeBlock(today, 11, 30),
    },
    {
      id: 'seed-task-improve-todo',
      ownerId: adminUser.id,
      taskType: 'IMPROVE' as const,
      title: 'Draft constraint-based priority framework for new locations',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      goalId: yearlyGoalRecords['seed-yearly-2026']?.id,
      estimatedMinutes: 90,
      dueDate: dayAfterTomorrow,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-react-todo-high',
      ownerId: adminUser.id,
      taskType: 'REACT' as const,
      title: 'Urgent: respond to investor due diligence request',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      estimatedMinutes: 60,
      dueDate: today,
      isWinTheDay: false,
      timeBlockStart: timeBlock(today, 14, 0),
      timeBlockEnd: timeBlock(today, 15, 0),
    },
    {
      id: 'seed-task-react-done',
      ownerId: adminUser.id,
      taskType: 'REACT' as const,
      title: 'Fix broken payment integration for location #4',
      status: TaskStatus.DONE,
      priority: TaskPriority.URGENT,
      estimatedMinutes: 45,
      dueDate: yesterday,
      completedAt: yesterday,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-maint-recurring',
      ownerId: adminUser.id,
      taskType: 'MAINTENANCE' as const,
      title: 'Weekly team standup prep',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      estimatedMinutes: 15,
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      dueDate: today,
      isWinTheDay: false,
      timeBlockStart: timeBlock(today, 15, 30),
      timeBlockEnd: timeBlock(today, 15, 45),
    },
    {
      id: 'seed-task-maint-inprogress',
      ownerId: adminUser.id,
      taskType: 'MAINTENANCE' as const,
      title: 'Update CRM contact records for Q1 leads',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      estimatedMinutes: 60,
      dueDate: tomorrow,
      startedAt: today,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-assigned-sarah',
      ownerId: adminUser.id,
      assigneeId: sarah.id,
      taskType: 'IMPROVE' as const,
      title: 'Research competitor pricing in Southeast region',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      estimatedMinutes: 120,
      dueDate: thisWeekFriday,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-extra-react',
      ownerId: adminUser.id,
      taskType: 'REACT' as const,
      title: 'Review and approve new hire onboarding docs',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      estimatedMinutes: 30,
      dueDate: tomorrow,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-extra-improve',
      ownerId: adminUser.id,
      taskType: 'IMPROVE' as const,
      title: 'Prepare board presentation on 12-month roadmap',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      goalId: yearlyGoalRecords['seed-yearly-2026']?.id,
      estimatedMinutes: 240,
      dueDate: thisWeekFriday,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-review-weekly',
      ownerId: adminUser.id,
      taskType: 'REVIEW' as const,
      title: 'Weekly report',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      estimatedMinutes: 30,
      dueDate: thisWeekFriday,
      isWinTheDay: false,
    },
    {
      id: 'seed-task-react-claude',
      ownerId: adminUser.id,
      taskType: 'REACT' as const,
      title: 'Set up Claude with Google Workspace CLI to better organize calendar',
      description: 'Working prototype',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      estimatedMinutes: 90,
      dueDate: today,
      startedAt: yesterday,
      isWinTheDay: false,
      timeBlockStart: timeBlock(today, 11, 0),
      timeBlockEnd: timeBlock(today, 12, 0),
    },
    {
      id: 'seed-task-improve-location',
      ownerId: adminUser.id,
      taskType: 'IMPROVE' as const,
      title: 'Draft location scouting plan for Q2 expansion',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      goalId: currentMonthGoals[currentMonthKey]?.id,
      estimatedMinutes: 60,
      dueDate: tomorrow,
      isWinTheDay: false,
    },
  ];

  for (const t of taskSeeds) {
    const { id, ...rest } = t;
    await prisma.task.upsert({
      where: { id },
      update: {
        title: rest.title,
        status: rest.status,
        priority: rest.priority,
        estimatedMinutes: rest.estimatedMinutes,
        isWinTheDay: rest.isWinTheDay,
      },
      create: {
        id,
        ...rest,
      },
    });
  }

  // ============================================================
  // SECTION 5: UserAims (4 aims in different phases)
  // ============================================================
  const userAimSeeds = [
    {
      userId: adminUser.id,
      aimCategoryId: 'deep-work',
      currentPhase: 'FLOW',
      currentStreak: 14,
      bestStreak: 14,
      completionCount: 45,
      lastCompletedAt: yesterday,
    },
    {
      userId: adminUser.id,
      aimCategoryId: 'exercise',
      currentPhase: 'SPROUT',
      currentStreak: 3,
      bestStreak: 5,
      completionCount: 8,
      lastCompletedAt: yesterday,
    },
    {
      userId: adminUser.id,
      aimCategoryId: 'flow-activity',
      currentPhase: 'SEED',
      currentStreak: 1,
      bestStreak: 1,
      completionCount: 2,
      lastCompletedAt: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      userId: adminUser.id,
      aimCategoryId: 'active-recovery',
      currentPhase: 'GROW',
      currentStreak: 7,
      bestStreak: 10,
      completionCount: 20,
      lastCompletedAt: yesterday,
    },
  ];

  for (const ua of userAimSeeds) {
    await prisma.userAim.upsert({
      where: {
        userId_aimCategoryId: {
          userId: ua.userId,
          aimCategoryId: ua.aimCategoryId,
        },
      },
      update: {
        isActive: true,
        currentPhase: ua.currentPhase,
        currentStreak: ua.currentStreak,
        bestStreak: ua.bestStreak,
        completionCount: ua.completionCount,
        lastCompletedAt: ua.lastCompletedAt,
      },
      create: {
        ...ua,
        isActive: true,
      },
    });
  }

  // ============================================================
  // SECTION 6: AimInstances (last 14 days)
  // ============================================================
  // Clear old seeded aim instances for admin to make idempotent
  await prisma.aimInstance.deleteMany({
    where: {
      userId: adminUser.id,
      scheduledDate: {
        gte: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const aimInstanceData: Array<{
    userId: string;
    aimCategoryId: string;
    scheduledDate: Date;
    status: string;
    completedAt?: Date;
    selectedActivity?: string;
    phaseAtCompletion?: string;
    pointsEarned: number;
  }> = [];

  for (let d = 0; d < 14; d++) {
    const date = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
    const dayOfWeek = date.getUTCDay(); // 0=Sun

    const isToday = d === 0;

    // Deep Work: daily, 11/14 completed. TODAY = SCHEDULED (not done yet)
    const deepWorkCompleted = !isToday && d !== 2 && d !== 7 && d !== 12;
    aimInstanceData.push({
      userId: adminUser.id,
      aimCategoryId: 'deep-work',
      scheduledDate: date,
      status: deepWorkCompleted ? 'COMPLETED' : 'SCHEDULED',
      completedAt: deepWorkCompleted ? date : undefined,
      phaseAtCompletion: deepWorkCompleted ? 'FLOW' : undefined,
      pointsEarned: deepWorkCompleted ? 10 : 0,
      ...(isToday ? { timeBlockStart: timeBlock(date, 9, 0), timeBlockEnd: timeBlock(date, 10, 30) } : {}),
    });

    // Exercise: every day for seeding, but TODAY always gets one SCHEDULED
    if (isToday || dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      const exerciseCompleted = !isToday && d < 10;
      aimInstanceData.push({
        userId: adminUser.id,
        aimCategoryId: 'exercise',
        scheduledDate: date,
        status: exerciseCompleted ? 'COMPLETED' : 'SCHEDULED',
        completedAt: exerciseCompleted ? date : undefined,
        selectedActivity: isToday ? 'strength' : ['strength', 'cardio', 'HIIT'][d % 3],
        phaseAtCompletion: exerciseCompleted ? 'SPROUT' : undefined,
        pointsEarned: exerciseCompleted ? 5 : 0,
        ...(isToday ? { timeBlockStart: timeBlock(date, 12, 0), timeBlockEnd: timeBlock(date, 13, 0) } : {}),
      });
    }

    // Active Recovery: always one for today SCHEDULED
    if (isToday || dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6) {
      const recoveryCompleted = !isToday && d < 12;
      aimInstanceData.push({
        userId: adminUser.id,
        aimCategoryId: 'active-recovery',
        scheduledDate: date,
        status: recoveryCompleted ? 'COMPLETED' : 'SCHEDULED',
        completedAt: recoveryCompleted ? date : undefined,
        selectedActivity: isToday ? 'sauna' : ['sauna', 'mindfulness', 'light yoga'][d % 3],
        phaseAtCompletion: recoveryCompleted ? 'GROW' : undefined,
        pointsEarned: recoveryCompleted ? 5 : 0,
        ...(isToday ? { timeBlockStart: timeBlock(date, 18, 0), timeBlockEnd: timeBlock(date, 18, 30) } : {}),
      });
    }

    // Flow Activity: 1 per week (Saturday)
    if (dayOfWeek === 6) {
      const flowCompleted = d < 7;
      aimInstanceData.push({
        userId: adminUser.id,
        aimCategoryId: 'flow-activity',
        scheduledDate: date,
        status: flowCompleted ? 'COMPLETED' : 'SCHEDULED',
        completedAt: flowCompleted ? date : undefined,
        selectedActivity: 'painting',
        phaseAtCompletion: flowCompleted ? 'SEED' : undefined,
        pointsEarned: flowCompleted ? 5 : 0,
      });
    }
  }

  for (const inst of aimInstanceData) {
    await prisma.aimInstance.create({ data: inst });
  }

  // ============================================================
  // SECTION 7: Reviews (3 reviews)
  // ============================================================
  // Next Friday for weekly review
  const nextFriday = new Date(today);
  nextFriday.setUTCDate(nextFriday.getUTCDate() + ((5 - today.getUTCDay() + 7) % 7 || 7));

  // Weekly review — scheduled for next Friday
  await prisma.review.upsert({
    where: { id: 'seed-review-weekly' },
    update: {
      scheduledDate: nextFriday,
      timeBlockStart: timeBlock(nextFriday, 14, 0),
      timeBlockEnd: timeBlock(nextFriday, 14, 30),
    },
    create: {
      id: 'seed-review-weekly',
      userId: adminUser.id,
      reviewType: ReviewType.WEEKLY,
      scheduledDate: nextFriday,
      timeBlockStart: timeBlock(nextFriday, 14, 0),
      timeBlockEnd: timeBlock(nextFriday, 14, 30),
      recurrenceDayOfWeek: 5, // Friday
    },
  });

  // Monthly review — completed last month
  const lastMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 28));
  await prisma.review.upsert({
    where: { id: 'seed-review-monthly' },
    update: {
      scheduledDate: lastMonth,
      completedAt: lastMonth,
      notes: 'Good progress on location expansion. Need to accelerate hiring pipeline for new markets. Revenue tracking dashboard is 80% complete. Key takeaway: focus on constraint-based scheduling to unblock the ops team.',
    },
    create: {
      id: 'seed-review-monthly',
      userId: adminUser.id,
      reviewType: ReviewType.MONTHLY,
      scheduledDate: lastMonth,
      completedAt: lastMonth,
      notes: 'Good progress on location expansion. Need to accelerate hiring pipeline for new markets. Revenue tracking dashboard is 80% complete. Key takeaway: focus on constraint-based scheduling to unblock the ops team.',
    },
  });

  // Yearly review — scheduled for Dec 2026
  const yearlyReviewDate = new Date(Date.UTC(2026, 11, 18)); // Dec 18, 2026
  await prisma.review.upsert({
    where: { id: 'seed-review-yearly' },
    update: { scheduledDate: yearlyReviewDate },
    create: {
      id: 'seed-review-yearly',
      userId: adminUser.id,
      reviewType: ReviewType.YEARLY,
      scheduledDate: yearlyReviewDate,
    },
  });

  // ============================================================
  // SECTION 8: PowerDown Session
  // ============================================================
  // Delete + recreate for idempotency (no unique constraint)
  await prisma.powerdownSession.deleteMany({
    where: { userId: adminUser.id, sessionDate: yesterday },
  });
  await prisma.powerdownSession.create({
    data: {
      userId: adminUser.id,
      sessionDate: yesterday,
      currentStep: 5,
      completedAt: timeBlock(yesterday, 17, 45),
      timeBlockStart: timeBlock(yesterday, 17, 30),
      timeBlockEnd: timeBlock(yesterday, 17, 45),
      distractions: [
        'Got pulled into a Slack thread about office supplies for 20 min',
        'Checked Twitter twice during deep work block',
      ],
      gratitudes: [
        'Sarah closed the Southeast pricing research ahead of schedule',
        'Landlord approved favorable lease terms for location #5',
        'Had a great deep work session on the Snowflake dashboard',
      ],
      ideas: [
        'Automate weekly standup notes with AI summary from Slack',
        'Create a location launch playbook template',
      ],
      clearGoals: [
        'Finish Snowflake baseline dashboard',
        'Respond to investor due diligence request',
        'Prep for Monday team standup',
      ],
      tomorrowPlan: [
        { title: 'Deep work: Snowflake dashboard', timeBlock: '09:00-10:30' },
        { title: 'Investor response', timeBlock: '11:00-12:00' },
        { title: 'Team standup prep', timeBlock: '08:30-08:45' },
      ],
    },
  });

  // ============================================================
  // SECTION 9: DistractionLogs (3 entries)
  // ============================================================
  await prisma.distractionLog.deleteMany({
    where: {
      userId: adminUser.id,
      logDate: {
        gte: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const distractionSeeds = [
    {
      userId: adminUser.id,
      content: 'Social media rabbit hole during deep work',
      notes: 'Opened Twitter to check one notification, ended up scrolling for 15 minutes. Need to block during focus time.',
      logDate: yesterday,
      source: 'powerdown',
    },
    {
      userId: adminUser.id,
      content: 'Unplanned meeting with vendor',
      notes: 'Vendor called about a billing issue. Should have deferred to Sarah. Lost 30 min of focus block.',
      logDate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
      source: 'manual',
    },
    {
      userId: adminUser.id,
      content: 'Email checking compulsion',
      notes: 'Checked email 6 times before lunch. Set a rule: only check at 10am and 2pm.',
      logDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
      source: 'powerdown',
    },
  ];

  for (const dl of distractionSeeds) {
    await prisma.distractionLog.create({ data: dl });
  }

  // ============================================================
  // SECTION 10: Meetings
  // ============================================================
  // Delete + recreate for idempotency
  await prisma.meeting.deleteMany({
    where: { createdById: adminUser.id, title: 'Team Standup' },
  });
  await prisma.meeting.create({
    data: {
      title: 'Team Standup',
      description: 'Weekly team standup — share blockers, wins, and priorities for the week.',
      cadence: 'WEEKLY',
      dayOfWeek: 1, // Monday
      timeStart: '09:00',
      timeEnd: '09:30',
      attendeeIds: [adminUser.id, sarah.id, james.id],
      createdById: adminUser.id,
    },
  });

  // ============================================================
  // SECTION 11: Ideas (2 ideas)
  // ============================================================
  await prisma.idea.upsert({
    where: { id: 'seed-idea-submitted' },
    update: {
      title: 'Automate location launch checklist with process templates',
      status: IdeaStatus.SUBMITTED,
    },
    create: {
      id: 'seed-idea-submitted',
      authorId: adminUser.id,
      title: 'Automate location launch checklist with process templates',
      description: 'Each new location launch follows the same 47-step process. We should templatize this as a business process with auto-generated tasks. Would save ~8 hours per launch.',
      confidenceScore: 8,
      easeScore: 6,
      impactScore: 9,
      iceScore: 7.67,
      status: IdeaStatus.SUBMITTED,
    },
  });

  await prisma.idea.upsert({
    where: { id: 'seed-idea-approved' },
    update: {
      title: 'Implement constraint-based scheduling for ops team',
      status: IdeaStatus.APPROVED,
    },
    create: {
      id: 'seed-idea-approved',
      authorId: adminUser.id,
      title: 'Implement constraint-based scheduling for ops team',
      description: 'Use constraint-based scheduling to automatically assign ops team members to location coverage based on availability, skill, and proximity. Reduces manual scheduling from 4hrs/week to 30min.',
      confidenceScore: 7,
      easeScore: 4,
      impactScore: 10,
      iceScore: 7.0,
      status: IdeaStatus.APPROVED,
    },
  });

  // ============================================================
  // SECTION 12: Invitations
  // ============================================================
  // Use deleteMany + create since Invitation has no unique constraint on email
  await prisma.invitation.deleteMany({
    where: { email: 'newguy@upwhiten.com' },
  });
  await prisma.invitation.create({
    data: {
      email: 'newguy@upwhiten.com',
      role: 'user',
      status: InvitationStatus.PENDING,
      invitedById: adminUser.id,
    },
  });

  // ============================================================
  // SECTION 13: Streaks
  // ============================================================
  const streakData = { currentCount: 5, bestCount: 12, lastActiveDate: yesterday };
  await prisma.streak.upsert({
    where: {
      userId_streakType: {
        userId: adminUser.id,
        streakType: 'daily_completion',
      },
    },
    update: streakData,
    create: {
      userId: adminUser.id,
      streakType: 'daily_completion',
      ...streakData,
    },
  });

  // ============================================================
  // Done!
  // ============================================================
  console.log([
    `Seed complete:`,
    `  - 4 ReviewTemplates`,
    `  - CompanySettings`,
    `  - 3 Users: Admin (${adminUser.email}), Sarah (${sarah.email}), James (${james.email})`,
    `  - 7 AimCategories`,
    `  - Goal Stack: 1 HHG > 3 Yearly > ${12 * 3} Monthly > weekly goals for current+next month`,
    `  - 3 KPIs (Revenue, Locations Opened, New Clients)`,
    `  - 10 Tasks (IMPROVE/REACT/MAINTENANCE mix, 1 assigned to Sarah, 1 WinTheDay)`,
    `  - 4 UserAims (FLOW, SPROUT, SEED, GROW phases)`,
    `  - ${aimInstanceData.length} AimInstances (14 days of history)`,
    `  - 3 Reviews (weekly scheduled, monthly completed, yearly scheduled)`,
    `  - 1 PowerdownSession (yesterday, completed)`,
    `  - 3 DistractionLogs`,
    `  - 1 Meeting (Team Standup, weekly Monday 9:00-9:30)`,
    `  - 2 Ideas (1 SUBMITTED, 1 APPROVED)`,
    `  - 1 Invitation (newguy@upwhiten.com, PENDING)`,
    `  - 1 Streak (daily_completion, current: 5, best: 12)`,
  ].join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
