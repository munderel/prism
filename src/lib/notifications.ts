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
 * Fetches preferences once and passes them to avoid duplicate queries.
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  url?: string
) {
  const [prefs, user, subscriptions] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.pushSubscription.findMany({ where: { userId } }),
  ]);

  await Promise.all([
    sendPushNotifications(prefs, subscriptions, title, body, url),
    sendEmailNotification(prefs, transporter, user?.email, title, body),
  ]);
}

async function sendPushNotifications(
  prefs: { pushEnabled: boolean } | null,
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[],
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  if (prefs && !prefs.pushEnabled) return;

  const payload = JSON.stringify({ title, body, url });
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }),
  );
}

async function sendEmailNotification(
  prefs: { emailEnabled: boolean } | null,
  mailer: typeof transporter,
  email: string | undefined,
  title: string,
  body: string,
): Promise<void> {
  if (!mailer) return;
  if (prefs && !prefs.emailEnabled) return;
  if (!email) return;

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@goaldashboard.app',
      to: email,
      subject: title,
      html: `<p>${escapeHtml(body)}</p>`,
    });
  } catch (err) {
    console.error('[notifications] Email send failed:', err instanceof Error ? err.message : err);
  }
}
