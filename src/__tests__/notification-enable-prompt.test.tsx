/**
 * EnablePushPrompt component tests.
 *
 * Covers:
 * - iOS non-standalone → shows "Install to home screen" hint, NOT the enable button
 * - Non-iOS / desktop → shows "Enable notifications" button
 * - Already dismissed (localStorage) → renders nothing
 * - permission !== 'default' → renders nothing
 * - subscribeForPush outcomes → correct toast + dismiss behaviour for each
 */
import { screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/push-client', () => ({
  isIosNonStandalone: vi.fn(),
  subscribeForPush: vi.fn().mockResolvedValue('subscribed'),
}));

import { isIosNonStandalone, subscribeForPush } from '@/lib/push-client';
import { EnablePushPrompt } from '@/components/notifications/EnablePushPrompt';
import { renderWithProviders } from '@/test/utils';

const mockIsIos = isIosNonStandalone as ReturnType<typeof vi.fn>;
const mockSubscribe = subscribeForPush as ReturnType<typeof vi.fn>;

function setNotificationPermission(permission: 'default' | 'granted' | 'denied') {
  Object.defineProperty(window, 'Notification', {
    value: { permission },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  setNotificationPermission('default');
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {},
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: {},
    writable: true,
    configurable: true,
  });
  mockIsIos.mockReturnValue(false);
  mockSubscribe.mockResolvedValue('subscribed');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EnablePushPrompt', () => {
  it('shows Enable notifications button on desktop', () => {
    mockIsIos.mockReturnValue(false);
    renderWithProviders(<EnablePushPrompt />);
    expect(screen.getByText('Enable notifications')).toBeInTheDocument();
    expect(screen.queryByText(/home screen/i)).not.toBeInTheDocument();
  });

  it('shows iOS install hint when on iOS non-standalone', () => {
    mockIsIos.mockReturnValue(true);
    renderWithProviders(<EnablePushPrompt />);
    expect(screen.getByText(/Install for push notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
  });

  it('renders nothing when permission is already granted', () => {
    setNotificationPermission('granted');
    renderWithProviders(<EnablePushPrompt />);
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
    expect(screen.queryByText(/Install for push notifications/i)).not.toBeInTheDocument();
  });

  it('renders nothing when permission is denied', () => {
    setNotificationPermission('denied');
    renderWithProviders(<EnablePushPrompt />);
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
  });

  it('renders nothing when already dismissed', () => {
    localStorage.setItem('push-prompt-dismissed-v1', '1');
    renderWithProviders(<EnablePushPrompt />);
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
  });

  it('dismiss button hides the prompt and sets localStorage', async () => {
    const { findByLabelText } = renderWithProviders(<EnablePushPrompt />);
    const dismissBtn = await findByLabelText('Dismiss notification prompt');
    await act(async () => {
      dismissBtn.click();
    });
    await act(async () => {});
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
    expect(localStorage.getItem('push-prompt-dismissed-v1')).toBe('1');
  });

  it('on subscribed → shows success toast and dismisses', async () => {
    mockSubscribe.mockResolvedValue('subscribed');
    renderWithProviders(<EnablePushPrompt />);
    const btn = await screen.findByText('Enable notifications');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(await screen.findByText('Push notifications enabled')).toBeInTheDocument();
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
    expect(localStorage.getItem('push-prompt-dismissed-v1')).toBe('1');
  });

  it('on denied → shows error toast and dismisses', async () => {
    mockSubscribe.mockResolvedValue('denied');
    renderWithProviders(<EnablePushPrompt />);
    const btn = await screen.findByText('Enable notifications');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
    expect(localStorage.getItem('push-prompt-dismissed-v1')).toBe('1');
  });

  it('on unsupported → shows error toast and dismisses (no more silent fail)', async () => {
    mockSubscribe.mockResolvedValue('unsupported');
    renderWithProviders(<EnablePushPrompt />);
    const btn = await screen.findByText('Enable notifications');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(await screen.findByText(/not supported in this browser/i)).toBeInTheDocument();
    expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument();
    expect(localStorage.getItem('push-prompt-dismissed-v1')).toBe('1');
  });

  it('on error → shows error toast and keeps prompt visible for retry', async () => {
    mockSubscribe.mockResolvedValue('error');
    renderWithProviders(<EnablePushPrompt />);
    const btn = await screen.findByText('Enable notifications');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(await screen.findByText(/Could not enable push notifications/i)).toBeInTheDocument();
    expect(screen.getByText('Enable notifications')).toBeInTheDocument();
    expect(localStorage.getItem('push-prompt-dismissed-v1')).toBeNull();
  });
});
