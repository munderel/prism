import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return Response.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invitation.status !== 'PENDING') {
    return Response.json({ error: 'Only pending invitations can be revoked' }, { status: 400 });
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });

  return Response.json(updated);
}
