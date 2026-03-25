import { PrismaClient, Prisma, ReviewType } from '@prisma/client';
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
      reviewType: ReviewType.QUARTERLY,
      checklistItems: [
        { title: 'Review strategic goals', description: 'Full assessment of all strategic-level goals' },
        { title: 'Review High Hard Goal progress', description: 'Is the HHG still on track? Adjust timeline if needed' },
        { title: 'Company goal check', description: 'Review company goals and individual contributions' },
        { title: 'Full goal stack audit', description: 'Remove stale goals, add new ones, restructure if needed' },
        { title: 'Review MTP alignment', description: 'Does your work still align with your MTP?' },
        { title: 'Plan next quarter', description: 'Set strategic and monthly goals for the next quarter' },
      ],
      processSteps: [
        { title: 'Retrospective', description: 'What worked? What didn\'t? What surprised you?' },
        { title: 'Goal stack deep dive', description: 'Walk through every level of your goal stack' },
        { title: 'Prune and restructure', description: 'Remove goals that no longer serve the HHG' },
        { title: 'Recalibrate timelines', description: 'Adjust due dates based on actual velocity' },
        { title: 'Set quarterly targets', description: 'Define clear success criteria for next quarter' },
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
    },
    {
      name: 'Flow Activity',
      description: 'Engaging in an activity that produces a flow state',
      defaultFrequency: 2,
      defaultDurationMin: 180,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: Prisma.JsonNull,
    },
    {
      name: 'Exercise',
      description: 'Physical training session — strength, cardio, or sport',
      defaultFrequency: 3,
      defaultDurationMin: 60,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: Prisma.JsonNull,
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
    },
  ];

  for (const cat of aimCategories) {
    await prisma.aimCategory.upsert({
      where: { id: cat.name.toLowerCase().replace(/\s+/g, '-') },
      update: {
        name: cat.name,
        description: cat.description,
        defaultFrequency: cat.defaultFrequency,
        defaultDurationMin: cat.defaultDurationMin,
        isGroupable: cat.isGroupable,
        isDefault: cat.isDefault,
        isDaily: cat.isDaily,
        activities: cat.activities,
      },
      create: {
        id: cat.name.toLowerCase().replace(/\s+/g, '-'),
        name: cat.name,
        description: cat.description,
        defaultFrequency: cat.defaultFrequency,
        defaultDurationMin: cat.defaultDurationMin,
        isGroupable: cat.isGroupable,
        isDefault: cat.isDefault,
        isDaily: cat.isDaily,
        activities: cat.activities,
      },
    });
  }

  console.log(`Seed complete: 4 ReviewTemplates + CompanySettings + Admin user (${adminUser.email}) + 7 AimCategories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
