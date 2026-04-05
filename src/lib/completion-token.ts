import { createHmac, timingSafeEqual } from 'crypto';

const SECRET =
  process.env.TOKEN_ENCRYPTION_KEY ||
  process.env.NEXTAUTH_SECRET ||
  'prism-default-secret';

export function generateCompletionToken(taskId: string, userId: string): string {
  return createHmac('sha256', SECRET)
    .update(`${taskId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
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
  return createHmac('sha256', SECRET)
    .update(`aim:${aimInstanceId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
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
  return process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
}
