import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, authSettingsSchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const settings = await prisma.companyAuthSettings.findFirst();
  return Response.json(settings ?? { enforce2FA: false, disableSeedAims: false });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, authSettingsSchema);
  if ('error' in parsed) return parsed.error;
  // Only apply keys that were actually provided so a partial PATCH (e.g. just
  // toggling disableSeedAims) doesn't clobber the other flag.
  const data: { enforce2FA?: boolean; disableSeedAims?: boolean } = {};
  if (parsed.data.enforce2FA !== undefined) data.enforce2FA = parsed.data.enforce2FA;
  if (parsed.data.disableSeedAims !== undefined) data.disableSeedAims = parsed.data.disableSeedAims;

  const existing = await prisma.companyAuthSettings.findFirst();
  const result = existing
    ? await prisma.companyAuthSettings.update({ where: { id: existing.id }, data })
    : await prisma.companyAuthSettings.create({ data });

  return Response.json(result);
}
