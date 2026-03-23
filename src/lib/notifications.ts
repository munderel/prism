import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { prisma } from './prisma';

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Configure nodemailer
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

/**
 * Send push notification to a user.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string
) {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (prefs && !prefs.pushEnabled) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const payload = JSON.stringify({ title, body, url });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
    } catch (err: any) {
      // Remove invalid subscriptions (410 Gone or 404)
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }
}

/**
 * Send email notification to a user.
 */
export async function sendEmailNotification(
  userId: string,
  subject: string,
  html: string
) {
  if (!transporter) return;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (prefs && !prefs.emailEnabled) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) return;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@goaldashboard.app',
      to: user.email,
      subject,
      html,
    });
  } catch (err) {
    console.error('[notifications] Email send failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Escape HTML special characters to prevent XSS attacks.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notify a user (both push + email).
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  url?: string
) {
  await Promise.all([
    sendPushNotification(userId, title, body, url),
    sendEmailNotification(userId, title, `<p>${escapeHtml(body)}</p>`),
  ]);
}
