import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const settings = await prisma.companyAuthSettings.findFirst();
  return Response.json(settings ?? { enforce2FA: false });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { enforce2FA } = parsed.data;

  const existing = await prisma.companyAuthSettings.findFirst();
  const result = existing
    ? await prisma.companyAuthSettings.update({ where: { id: existing.id }, data: { enforce2FA } })
    : await prisma.companyAuthSettings.create({ data: { enforce2FA } });

  return Response.json(result);
}
