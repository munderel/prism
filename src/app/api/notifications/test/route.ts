import { requireAuth, authError } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sendTestEmail } from '@/lib/notifications';

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });

  if (!user?.email) {
    return Response.json(
      { configured: false, sent: false, error: 'No email address on your account' },
      { status: 400 },
    );
  }

  const result = await sendTestEmail(user.email);
  return Response.json(result);
}
