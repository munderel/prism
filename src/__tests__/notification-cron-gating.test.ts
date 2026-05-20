/**
 * Tests that the notifyUser dispatcher respects per-channel prefs.
 * Specifically: when PUSH_DESKTOP is disabled for DERAILING, a desktop
 * subscription should not receive a push.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationType, NotificationChannel } from '@prisma/client';

// web-push is a CommonJS module; Vite wraps it with a default interop.
// Use vi.hoisted so the reference is available inside the hoisted vi.mock factory.
const { mockSendNotification } = vi.hoisted(() => ({
  mockSendNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
  },
  setVapidDetails: vi.fn(),
  sendNotification: mockSendNotification,
}));

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
  },
}));

// Mock resend
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({ data: {}, error: null }) } })),
}));

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    pushSubscription: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    notificationChannelPref: { findMany: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';

const mockPrisma = prisma as any;

beforeEach(() => { vi.clearAllMocks(); });

describe('notifyUser — per-channel dispatcher gating', () => {
  const userId = 'user-1';

  function setupUser() {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'user@example.com' });
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      pushEnabled: true,
      derailingAlerts: true,
    });
    mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
  }

  it('sends push to desktop subscription when PUSH_DESKTOP is enabled', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.ex/1', p256dh: 'pk', auth: 'au', deviceType: 'desktop' },
    ]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.PUSH_DESKTOP, enabled: true },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: true },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.EMAIL, enabled: true },
    ]);

    await notifyUser(userId, 'Derailing!', 'Task is derailing', '/tasks', NotificationType.DERAILING);

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it('does NOT send push to desktop subscription when PUSH_DESKTOP is disabled', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.ex/1', p256dh: 'pk', auth: 'au', deviceType: 'desktop' },
    ]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.PUSH_DESKTOP, enabled: false },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: true },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.EMAIL, enabled: true },
    ]);

    await notifyUser(userId, 'Derailing!', 'Task is derailing', '/tasks', NotificationType.DERAILING);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends push to mobile but not desktop when only PUSH_MOBILE is enabled', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-desktop', endpoint: 'https://push.ex/desktop', p256dh: 'pk', auth: 'au', deviceType: 'desktop' },
      { id: 'sub-mobile', endpoint: 'https://push.ex/mobile', p256dh: 'pk2', auth: 'au2', deviceType: 'mobile' },
    ]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.PUSH_DESKTOP, enabled: false },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.PUSH_MOBILE, enabled: true },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: false },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.EMAIL, enabled: false },
    ]);

    await notifyUser(userId, 'Derailing!', 'Task is derailing', '/tasks', NotificationType.DERAILING);

    // Only the mobile sub should fire
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.ex/mobile' }),
      expect.any(String),
    );
  });

  it('treats unknown/null deviceType as desktop', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-unknown', endpoint: 'https://push.ex/unk', p256dh: 'pk', auth: 'au', deviceType: null },
    ]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.PUSH_DESKTOP, enabled: false },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: false },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.EMAIL, enabled: false },
    ]);

    await notifyUser(userId, 'Derailing!', 'Task is derailing', '/tasks', NotificationType.DERAILING);

    // unknown type → uses PUSH_DESKTOP pref (false) → no push
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('creates in-app notification when IN_APP is enabled', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: true },
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.EMAIL, enabled: false },
    ]);

    await notifyUser(userId, 'Title', 'Body', '/url', NotificationType.DERAILING);

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          type: NotificationType.DERAILING,
          payload: expect.objectContaining({ title: 'Title', body: 'Body' }),
        }),
      }),
    );
  });

  it('does NOT create in-app notification when IN_APP is disabled', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([]);
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([
      { notifType: NotificationType.DERAILING, channel: NotificationChannel.IN_APP, enabled: false },
    ]);

    await notifyUser(userId, 'Title', 'Body', '/url', NotificationType.DERAILING);

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('defaults to enabled when no channel pref row exists', async () => {
    setupUser();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.ex/1', p256dh: 'pk', auth: 'au', deviceType: 'desktop' },
    ]);
    // No pref rows at all → defaults to enabled
    mockPrisma.notificationChannelPref.findMany.mockResolvedValue([]);

    await notifyUser(userId, 'Title', 'Body', undefined, NotificationType.GENERIC);

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
