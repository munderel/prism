import { createHmac, timingSafeEqual } from 'crypto';

function getSecret(): string {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'completion-token: TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set. ' +
      'Refusing to use a hardcoded fallback secret.'
    );
  }
  return secret;
}

export function generateCompletionToken(taskId: string, userId: string): string {
  return createHmac('sha256', getSecret())
    .update(`${taskId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyCompletionToken(taskId: string, userId: string, token: string): boolean {
  const expected = generateCompletionToken(taskId, userId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function getCompletionUrl(taskId: string, userId: string): string {
  const token = generateCompletionToken(taskId, userId);
  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/tasks/${taskId}/complete-external?token=${token}&userId=${userId}`;
}

// --- Aim completion helpers ---

export function generateAimToken(aimInstanceId: string, userId: string): string {
  return createHmac('sha256', getSecret())
    .update(`aim:${aimInstanceId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyAimToken(aimInstanceId: string, userId: string, token: string): boolean {
  const expected = generateAimToken(aimInstanceId, userId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function getAimCompletionUrl(aimInstanceId: string, userId: string): string {
  const token = generateAimToken(aimInstanceId, userId);
  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/aims/instances/${aimInstanceId}/complete-external?token=${token}&userId=${userId}`;
}

// --- Shared helpers ---

export function getBaseUrl(): string {
  const raw = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  return raw.startsWith('http') ? raw : `https://${raw}`;
}
