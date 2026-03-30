import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeParseJson } from '@/lib/api-helpers';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';

/**
 * GET /api/auth/setup-2fa
 * Generate a TOTP secret and QR code for the authenticated user.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { email: true, is2FAEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.is2FAEnabled) {
    return NextResponse.json(
      { error: '2FA is already enabled. Disable it first to reconfigure.' },
      { status: 400 }
    );
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({ secret, issuer: 'Prism', label: user.email });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Store the secret temporarily (not yet verified)
  await prisma.user.update({
    where: { id: session.user.id as string },
    data: { totpSecret: secret },
  });

  return NextResponse.json({
    secret,
    qrCode: qrCodeDataUrl,
    otpauthUrl,
  });
}

/**
 * POST /api/auth/setup-2fa
 * Verify TOTP code and enable 2FA for the authenticated user.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { code } = body;
  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { totpSecret: true, is2FAEnabled: true },
  });

  if (!user?.totpSecret) {
    return NextResponse.json(
      { error: 'No 2FA secret found. Start setup first.' },
      { status: 400 }
    );
  }

  if (user.is2FAEnabled) {
    return NextResponse.json(
      { error: '2FA is already enabled' },
      { status: 400 }
    );
  }

  const isValid = verifySync({
    token: code,
    secret: user.totpSecret,
  });

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid verification code' },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id as string },
    data: { is2FAEnabled: true },
  });

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * DELETE /api/auth/setup-2fa
 * Disable 2FA for the authenticated user.
 */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { code } = body;
  if (!code) {
    return NextResponse.json({ error: 'Current 2FA code is required to disable' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { totpSecret: true, is2FAEnabled: true },
  });

  if (!user?.is2FAEnabled || !user.totpSecret) {
    return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
  }

  const isValid = verifySync({
    token: code,
    secret: user.totpSecret,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id as string },
    data: { is2FAEnabled: false, totpSecret: null },
  });

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
