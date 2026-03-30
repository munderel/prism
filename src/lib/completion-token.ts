import crypto from 'crypto';

const SECRET = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'prism-default-secret';

export function generateCompletionToken(taskId: string, userId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`${taskId}:${userId}`).digest('hex').slice(0, 16);
}

export function verifyCompletionToken(taskId: string, userId: string, token: string): boolean {
  const expected = generateCompletionToken(taskId, userId);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function getCompletionUrl(taskId: string, userId: string): string {
  const token = generateCompletionToken(taskId, userId);
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  return `${baseUrl}/api/tasks/${taskId}/complete-external?token=${token}&userId=${userId}`;
}
