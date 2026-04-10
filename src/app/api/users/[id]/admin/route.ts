import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, adminUserActionSchema } from '@/lib/schemas';

const ACTION_DATA: Record<string, Record<string, unknown>> = {
  lockout: { isLockedOut: true },
  unlock: { isLockedOut: false },
  'reset-2fa': { is2FAEnabled: false, totpSecret: null },
  'reset-password': { passwordHash: null },
};

/**
 * PATCH /api/users/[id]/admin
 * Admin-only: lock/unlock users, reset 2FA, reset accounts.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, adminUserActionSchema);
  if ('error' in parsed) return parsed.error;
  const { action } = parsed.data;
  const targetUserId = params.id;

  if (targetUserId === auth.userId && action === 'lockout') {
    return Response.json(
      { error: 'Cannot lock out your own account' },
      { status: 400 }
    );
  }

  const data = ACTION_DATA[action];

  await prisma.user.update({
    where: { id: targetUserId },
    data,
  });

  return Response.json({ ok: true }, NO_STORE);
}
