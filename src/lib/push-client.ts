/**
 * push-client.ts
 *
 * Client-side utilities for subscribing to Web Push.
 * Call `subscribeForPush()` after obtaining user consent.
 */

export type PushDeviceType = 'mobile' | 'desktop' | 'tablet';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer.buffer;
}

/** Detect device type from user agent string. */
export function detectDeviceType(ua: string = navigator.userAgent): PushDeviceType {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Generate a friendly human-readable label for this browser/device. */
export function detectDeviceLabel(ua: string = navigator.userAgent): string {
  if (/iPhone/i.test(ua)) return 'iPhone Safari';
  if (/iPad/i.test(ua)) return 'iPad Safari';
  if (/Android.*Chrome/i.test(ua)) return 'Android Chrome';
  if (/Android/i.test(ua)) return 'Android Browser';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua)) return 'Safari';
  if (/Edge/i.test(ua)) return 'Edge';
  return 'Browser';
}

/** True when running on iOS (iPhone/iPad/iPod) and NOT installed as a standalone PWA. */
export function isIosNonStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

/**
 * Full subscribe flow:
 * 1. Requests Notification permission if not yet granted.
 * 2. Registers the service worker at /sw.js.
 * 3. Calls pushManager.subscribe with the VAPID public key.
 * 4. POSTs the resulting subscription + metadata to /api/notifications/subscribe.
 *
 * Returns 'subscribed' | 'denied' | 'unsupported' | 'error'.
 */
export async function subscribeForPush(): Promise<'subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] serviceWorker or PushManager not supported by this browser');
    return 'unsupported';
  }

  // 1. Fetch the VAPID public key from the server
  let vapidPublicKey: string;
  try {
    const res = await fetch('/api/notifications/public-key');
    if (!res.ok) {
      console.error('[push] VAPID key fetch returned non-OK', res.status, await res.text().catch(() => ''));
      return 'error';
    }
    const json = (await res.json()) as { key?: string };
    if (!json.key) {
      console.warn('[push] VAPID public key is empty — VAPID_PUBLIC_KEY env var likely unset on server');
      return 'unsupported';
    }
    vapidPublicKey = json.key;
  } catch (err) {
    console.error('[push] VAPID key fetch threw', err);
    return 'error';
  }
  console.debug('[push] fetched VAPID key, requesting permission');

  // 2. Request browser permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[push] permission not granted:', permission);
    return 'denied';
  }
  console.debug('[push] permission granted, registering SW');

  try {
    // 3. Register / get service worker
    const reg = await navigator.serviceWorker.register('/sw.js');
    // Wait for it to be active
    await navigator.serviceWorker.ready;
    console.debug('[push] SW ready, subscribing', { active: !!reg.active, scope: reg.scope });

    // 4. Subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    console.debug('[push] subscribed, POSTing to API');

    const json = subscription.toJSON();
    const ua = navigator.userAgent;

    // 5. POST to our API
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        deviceType: detectDeviceType(ua),
        label: detectDeviceLabel(ua),
        userAgent: ua,
      }),
    });

    if (!res.ok) {
      console.error('[push] subscribe POST failed', res.status, await res.text().catch(() => ''));
      return 'error';
    }
    return 'subscribed';
  } catch (err) {
    console.error('[push] subscribe failed during SW register / pushManager.subscribe', err);
    return 'error';
  }
}
