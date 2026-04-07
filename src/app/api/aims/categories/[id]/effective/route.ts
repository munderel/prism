import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { getEffectiveDuration, getEffectiveFrequency, type UserAimLike } from '@/lib/aim-phases';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const userAim = await prisma.userAim.findFirst({
    where: { userId: auth.userId, aimCategoryId: id, isActive: true },
    include: { aimCategory: true },
  });

  if (!userAim) {
    return Response.json({ active: false });
  }

  const userAimLike: UserAimLike = {
    customDuration: userAim.customDuration,
    customFrequency: userAim.customFrequency,
    currentPhase: userAim.currentPhase,
    phaseStartedAt: userAim.phaseStartedAt,
    aimCategory: {
      defaultDurationMin: userAim.aimCategory.defaultDurationMin,
      defaultFrequency: userAim.aimCategory.defaultFrequency,
    },
  };

  return Response.json({
    active: true,
    aimCategoryId: userAim.aimCategoryId,
    name: userAim.aimCategory.name,
    currentPhase: userAim.currentPhase,
    effectiveDuration: getEffectiveDuration(userAimLike),
    effectiveFrequency: getEffectiveFrequency(userAimLike),
    defaultDurationMin: userAim.aimCategory.defaultDurationMin,
  });
}
