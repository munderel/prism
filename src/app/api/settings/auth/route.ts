import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeParseJson } from '@/lib/api-helpers';

/**
 * GET /api/settings/auth
 * Get company auth settings.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await prisma.companyAuthSettings.findFirst();
  return NextResponse.json(settings ?? { enforce2FA: false });
}

/**
 * PATCH /api/settings/auth
 * Admin-only: update company auth settings.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { enforce2FA } = body;

  const existing = await prisma.companyAuthSettings.findFirst();
  if (existing) {
    const updated = await prisma.companyAuthSettings.update({
      where: { id: existing.id },
      data: { enforce2FA },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.companyAuthSettings.create({
    data: { enforce2FA },
  });
  return NextResponse.json(created);
}
