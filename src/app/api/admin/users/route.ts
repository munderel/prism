import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { validateEmail } from '@/lib/api-helpers';
import { parseBody, adminCreateUserSchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Not available in production' }, { status: 403 });
  }

  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, adminCreateUserSchema);
  if ('error' in parsed) return parsed.error;
  const { email, name, role } = parsed.data;

  const emailResult = validateEmail(email);
  if ('error' in emailResult) {
    return Response.json({ error: emailResult.error }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: emailResult.email } });
  if (existing) {
    return Response.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: emailResult.email,
      name: name?.trim() || null,
      isAdmin: role === 'admin',
    },
    select: { id: true, email: true, name: true, isAdmin: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}
