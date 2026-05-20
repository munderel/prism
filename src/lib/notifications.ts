import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { NotificationType, NotificationChannel } from '@prisma/client';
import { prisma } from './prisma';

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Configure SMTP fallback
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

// Configure Resend for Vercel-friendly transactional email
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const defaultFromAddress =
  process.env.EMAIL_FROM ??
  process.env.SMTP_FROM ??
  'Prism <onboarding@resend.dev>';

export type EmailDeliveryResult = {
  configured: boolean;
  sent: boolean;
  error?: string;
};

export function isEmailTransportConfigured(): boolean {
  return resend !== null || transporter !== null;
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

async function sendEmailMessage(
  to: string,
  subject: string,
  html: string,
): Promise<EmailDeliveryResult> {
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: defaultFromAddress,
        to,
        subject,
        html,
      });

      if (error) {
        return {
          configured: true,
          sent: false,
          error: error.message,
        };
      }

      return {
        configured: true,
        sent: true,
      };
    } catch (err) {
      return {
        configured: true,
        sent: false,
        error: err instanceof Error ? err.message : 'Unknown Resend delivery error',
      };
    }
  }

  if (!transporter) {
    return {
      configured: false,
      sent: false,
      error: 'Invite email is not configured for this environment.',
    };
  }

  try {
    const info = await transporter.sendMail({
      from: defaultFromAddress,
      to,
      subject,
      html,
    });

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      return {
        configured: true,
        sent: false,
        error: `SMTP rejected recipient(s): ${info.rejected.join(', ')}`,
      };
    }

    return {
      configured: true,
      sent: Array.isArray(info.accepted) ? info.accepted.length > 0 : true,
      error: Array.isArray(info.accepted) && info.accepted.length > 0
        ? undefined
        : 'SMTP did not confirm delivery for the recipient.',
    };
  } catch (err) {
    return {
      configured: true,
      sent: false,
      error: err instanceof Error ? err.message : 'Unknown SMTP delivery error',
    };
  }
}

/**
 * Look up the enabled state for a (userId, notifType, channel) triple.
 * Falls back to true if no row exists (opt-in by default).
 */
async function isChannelEnabled(
  channelPrefs: { notifType: NotificationType; channel: NotificationChannel; enabled: boolean }[],
  notifType: NotificationType,
  channel: NotificationChannel,
): Promise<boolean> {
  const row = channelPrefs.find(
    (p) => p.notifType === notifType && p.channel === channel,
  );
  return row === undefined ? true : row.enabled;
}

/**
 * Notify a user (push + email + in-app inbox).
 *
 * @param userId   - Target user ID.
 * @param title    - Notification title.
 * @param body     - Notification body text.
 * @param url      - Optional deep-link URL.
 * @param notifType - Notification type for per-channel gating. Defaults to GENERIC.
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
  notifType: NotificationType = NotificationType.GENERIC,
) {
  const [user, subscriptions, channelPrefs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.pushSubscription.findMany({ where: { userId } }),
    prisma.notificationChannelPref.findMany({ where: { userId, notifType } }),
  ]);

  // Always create an in-app notification row if IN_APP is enabled
  const inAppEnabled = await isChannelEnabled(channelPrefs, notifType, NotificationChannel.IN_APP);
  if (inAppEnabled) {
    await prisma.notification.create({
      data: {
        userId,
        type: notifType,
        payload: { title, body, url: url ?? null },
      },
    }).catch((err: unknown) => {
      console.error('[notifications] Failed to create in-app notification:', err);
    });
  }

  await Promise.all([
    sendPushNotificationsGated(channelPrefs, subscriptions, notifType, title, body, url),
    sendEmailNotificationGated(channelPrefs, user?.email, notifType, title, body),
  ]);
}

async function sendPushNotificationsGated(
  channelPrefs: { notifType: NotificationType; channel: NotificationChannel; enabled: boolean }[],
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string; deviceType?: string | null }[],
  notifType: NotificationType,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const desktopEnabled = await isChannelEnabled(channelPrefs, notifType, NotificationChannel.PUSH_DESKTOP);
  const mobileEnabled = await isChannelEnabled(channelPrefs, notifType, NotificationChannel.PUSH_MOBILE);

  // Filter subscriptions to only those whose deviceType channel is enabled
  const eligible = subscriptions.filter((sub) => {
    const dt = sub.deviceType;
    if (dt === 'mobile') return mobileEnabled;
    if (dt === 'tablet') return mobileEnabled; // treat tablet same as mobile
    // desktop or unknown → use desktop pref
    return desktopEnabled;
  });

  if (eligible.length === 0) return;

  const payload = JSON.stringify({ title, body, url, type: notifType });
  await Promise.allSettled(
    eligible.map(async (sub) => {
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

async function sendEmailNotificationGated(
  channelPrefs: { notifType: NotificationType; channel: NotificationChannel; enabled: boolean }[],
  email: string | undefined,
  notifType: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  const emailEnabled = await isChannelEnabled(channelPrefs, notifType, NotificationChannel.EMAIL);
  if (!emailEnabled) return;
  if (!email) return;

  const result = await sendEmailMessage(email, title, `<p>${escapeHtml(body)}</p>`);
  if (!result.sent && result.configured) {
    console.error('[notifications] Email send failed:', result.error ?? 'Unknown email delivery error');
  }
}

/**
 * Send a test email so the user can verify delivery is working.
 */
export async function sendTestEmail(toEmail: string): Promise<EmailDeliveryResult> {
  return sendEmailMessage(
    toEmail,
    'Prism Test Email',
    '<p>This is a test email from Prism. If you received this, email notifications are working correctly.</p>',
  );
}

/**
 * Send an invitation email to a prospective user.
 * Bypasses notification preferences since the recipient isn't a user yet.
 */
export async function sendInviteEmail(
  toEmail: string,
  inviterName: string,
  inviteUrl: string,
): Promise<EmailDeliveryResult> {
  const result = await sendEmailMessage(
    toEmail,
    `You've been invited to join Prism`,
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4f46e5;">You're invited to Prism</h2>
        <p>${escapeHtml(inviterName)} has invited you to join their team on Prism.</p>
        <p>
          <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
      </div>
    `,
  );

  if (!result.sent && result.configured) {
    console.error('[notifications] Invite email send failed:', result.error ?? 'Unknown email delivery error');
  }

  return result;
}
