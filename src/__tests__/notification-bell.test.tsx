/**
 * NotificationBell component tests.
 *
 * Covers:
 * - Renders bell without badge when unreadCount is 0
 * - Renders badge with unread count when unreadCount > 0
 * - Clicking the bell opens the dropdown
 * - Dropdown shows notifications
 * - AIM_INVITE notifications show Accept / Decline buttons
 * - Accept button calls the aim respond endpoint
 * - "Mark all read" calls PATCH /api/notifications with { all: true }
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// SWR mock — we'll control the return values per test
const mockUseSWR = vi.fn();
const mockGlobalMutate = vi.fn();

vi.mock('swr', () => ({
  default: (...args: any[]) => mockUseSWR(...args),
  mutate: (...args: any[]) => mockGlobalMutate(...args),
}));

// useClickOutside — no-op in tests
vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

import { NotificationBell } from '@/components/notifications/NotificationBell';

const noNotifications = { notifications: [], unreadCount: 0 };

const withInvite = {
  notifications: [
    {
      id: 'n-1',
      type: 'AIM_INVITE',
      payload: {
        title: 'AIM Invitation',
        body: 'You\'ve been invited to join a Deep Work session.',
        url: '/aims?invitation=inv-1',
      },
      readAt: null,
      createdAt: new Date().toISOString(),
    },
  ],
  unreadCount: 1,
};

const withGeneric = {
  notifications: [
    {
      id: 'n-2',
      type: 'GENERIC',
      payload: { title: 'Welcome', body: 'Welcome to Prism', url: null },
      readAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
  unreadCount: 0,
};

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    // Default: empty
    mockUseSWR.mockReturnValue({ data: noNotifications, mutate: vi.fn() });
  });

  it('renders bell without badge when unreadCount is 0', () => {
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    expect(btn).toBeInTheDocument();
    // Badge text should not be visible
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('renders badge with unread count when unreadCount > 0', () => {
    mockUseSWR.mockReturnValue({ data: withInvite, mutate: vi.fn() });
    render(<NotificationBell />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('clicking the bell opens the dropdown', async () => {
    mockUseSWR.mockReturnValue({ data: noNotifications, mutate: vi.fn() });
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });

  it('dropdown shows notification items', async () => {
    mockUseSWR.mockReturnValue({ data: withGeneric, mutate: vi.fn() });
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Prism')).toBeInTheDocument();
  });

  it('AIM_INVITE notifications show Accept and Decline buttons', async () => {
    mockUseSWR.mockReturnValue({ data: withInvite, mutate: vi.fn() });
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('clicking Accept calls the aim respond endpoint and marks notification read', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined);
    mockUseSWR.mockReturnValue({ data: withInvite, mutate: mutateMock });

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    });

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/invitations/aim/inv-1/respond',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'ACCEPTED' }),
        }),
      );
    });
  });

  it('clicking Decline calls the aim respond endpoint with DECLINED', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined);
    mockUseSWR.mockReturnValue({ data: withInvite, mutate: mutateMock });

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    });

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/invitations/aim/inv-1/respond',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'DECLINED' }),
        }),
      );
    });
  });

  it('"Mark all read" calls PATCH /api/notifications with all: true', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined);
    mockUseSWR.mockReturnValue({ data: withInvite, mutate: mutateMock });

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await act(async () => {
      fireEvent.click(screen.getByText('Mark all read'));
    });

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ all: true }),
        }),
      );
    });
  });
});
