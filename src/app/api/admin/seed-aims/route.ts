import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

const DEFAULT_AIM_CATEGORIES = [
  {
    name: 'Deep Work',
    description: 'Focused, uninterrupted work session on your most important task',
    defaultFrequency: 7,
    defaultDurationMin: 90,
    isGroupable: false,
    isDefault: true,
    isDaily: true,
    activities: null as unknown,
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
    activities: null as unknown,
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
    activities: null as unknown,
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
    activities: null as unknown,
    schedulePeriod: 'casual',
  },
];

export async function POST() {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  // Org-wide kill switch: admins can disable seeding from Settings.
  const settings = await prisma.companyAuthSettings.findFirst({ select: { disableSeedAims: true } });
  if (settings?.disableSeedAims) {
    return Response.json(
      { error: 'Seeding default AIMs is disabled for this organization.' },
      { status: 403 },
    );
  }

  let count = 0;
  for (const cat of DEFAULT_AIM_CATEGORIES) {
    const id = cat.name.toLowerCase().replace(/\s+/g, '-');
    const data = {
      name: cat.name,
      description: cat.description,
      defaultFrequency: cat.defaultFrequency,
      defaultDurationMin: cat.defaultDurationMin,
      isGroupable: cat.isGroupable,
      isDefault: cat.isDefault,
      isDaily: cat.isDaily,
      activities: cat.activities === null ? undefined : cat.activities,
      schedulePeriod: cat.schedulePeriod,
    };
    await prisma.aimCategory.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    count++;
  }

  return Response.json({ count });
}
