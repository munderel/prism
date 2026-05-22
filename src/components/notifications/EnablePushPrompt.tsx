'use client';

import { useEffect, useState } from 'react';
import { Bell, Smartphone, X } from 'lucide-react';
import { subscribeForPush, isIosNonStandalone } from '@/lib/push-client';
import { useToast } from '@/components/ui/ToastProvider';

const DISMISS_KEY = 'push-prompt-dismissed-v1';

/**
 * EnablePushPrompt
 *
 * Shown at most once per session (dismiss state stored in localStorage).
 * - iOS non-standalone: shows "Install to home screen" hint.
 * - Otherwise: explains notification types and offers an "Enable notifications" button.
 * - Hidden if Notification.permission is already 'granted' or 'denied'.
 */
export function EnablePushPrompt() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // SSR guard — none of these APIs exist server-side
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;

    // Already dismissed this session
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    // Already granted or denied — no need to show the prompt
    if (Notification.permission !== 'default') return;

    // Not supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    setIsIos(isIosNonStandalone());
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function handleEnable() {
    setLoading(true);
    const result = await subscribeForPush();
    setLoading(false);
    if (result === 'subscribed') {
      toast.success('Push notifications enabled');
      dismiss();
    } else if (result === 'denied') {
      toast.error('Notification permission denied. Enable it in browser settings.');
      dismiss();
    } else if (result === 'unsupported') {
      toast.error('Push notifications are not supported in this browser');
      dismiss();
    } else {
      toast.error('Could not enable push notifications. Try again.');
      // Keep visible so user can retry
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable push notifications"
      className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-xl p-4 backdrop-blur-sm"
    >
      {/* Close button */}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
        className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X size={16} />
      </button>

      {isIos ? (
        /* iOS non-standalone hint */
        <div className="flex gap-3 items-start pr-5">
          <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Smartphone size={16} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Install for push notifications
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              iOS Safari supports push notifications only when Prism is installed to your home screen.
              Tap the{' '}
              <span className="font-medium text-indigo-400">Share</span> button, then{' '}
              <span className="font-medium text-indigo-400">Add to Home Screen</span>.
            </p>
          </div>
        </div>
      ) : (
        /* Standard prompt */
        <div className="flex gap-3 items-start pr-5">
          <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Bell size={16} className="text-indigo-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Stay on top of your goals
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
              Get push notifications for derailing tasks, review nags, meeting reminders, and more —
              even when Prism isn&apos;t open.
            </p>
            <button
              onClick={handleEnable}
              disabled={loading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors"
            >
              {loading ? 'Enabling…' : 'Enable notifications'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
