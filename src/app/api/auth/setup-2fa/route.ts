import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE, notFoundResponse } from '@/lib/api-helpers';
import { parseBody, totpCodeSchema } from '@/lib/schemas';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';

/** Extract and validate a TOTP code from the request body. */
async function extractCode(
  request: Request
): Promise<{ code: string; error?: never } | { code?: never; error: Response }> {
  const parsed = await parseBody(request, totpCodeSchema);
  if (parsed.error) {
    return { error: parsed.error };
  }
  return { code: parsed.data.code };
}

/**
 * GET /api/auth/setup-2fa
 * Generate a TOTP secret and QR code for the authenticated user.
 */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, is2FAEnabled: true },
  });

  if (!user) return notFoundResponse('User');

  if (user.is2FAEnabled) {
    return Response.json(
      { error: '2FA is already enabled. Disable it first to reconfigure.' },
      { status: 400 }
    );
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({ secret, issuer: 'Prism', label: user.email });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Store the secret temporarily (not yet verified)
  await prisma.user.update({
    where: { id: auth.userId },
    data: { totpSecret: secret },
  });

  return Response.json({ secret, qrCode: qrCodeDataUrl, otpauthUrl });
}

/**
 * POST /api/auth/setup-2fa
 * Verify TOTP code and enable 2FA for the authenticated user.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const extracted = await extractCode(request);
  if ('error' in extracted) return extracted.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { totpSecret: true, is2FAEnabled: true },
  });

  if (!user?.totpSecret) {
    return Response.json(
      { error: 'No 2FA secret found. Start setup first.' },
      { status: 400 }
    );
  }

  if (user.is2FAEnabled) {
    return Response.json({ error: '2FA is already enabled' }, { status: 400 });
  }

  if (!verifySync({ token: extracted.code, secret: user.totpSecret })) {
    return Response.json({ error: 'Invalid verification code' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { is2FAEnabled: true },
  });

  return Response.json({ ok: true }, NO_STORE);
}

/**
 * DELETE /api/auth/setup-2fa
 * Disable 2FA for the authenticated user.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const extracted = await extractCode(request);
  if ('error' in extracted) return extracted.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { totpSecret: true, is2FAEnabled: true },
  });

  if (!user?.is2FAEnabled || !user.totpSecret) {
    return Response.json({ error: '2FA is not enabled' }, { status: 400 });
  }

  if (!verifySync({ token: extracted.code, secret: user.totpSecret })) {
    return Response.json({ error: 'Invalid verification code' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { is2FAEnabled: false, totpSecret: null },
  });

  return Response.json({ ok: true }, NO_STORE);
}
