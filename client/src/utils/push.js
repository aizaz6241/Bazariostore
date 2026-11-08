import { api, sapi } from '../api.js';

// Phone / desktop push for the store app. kind = 'admin' | 'seller'.
const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}

// "I turned notifications off on this device" (only set by disablePush, so the panel does not
// switch them back on by itself the next time it opens)
const offKey = (kind) => `bz_push_off_${kind}`;
const isOptedOut = (kind) => {
  try { return localStorage.getItem(offKey(kind)) === '1'; } catch { return false; }
};
const setOptedOut = (kind, on) => {
  try { if (on) localStorage.setItem(offKey(kind), '1'); else localStorage.removeItem(offKey(kind)); } catch { /* private mode */ }
};

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isInstalledApp = () =>
  typeof window !== 'undefined' &&
  (window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);

export function pushState() {
  if (!supported()) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/**
 * What this device is doing right now:
 * 'on' | 'off' | 'denied' (blocked in browser / phone settings) |
 * 'ios-install' (iPhone: works only from the app on the Home Screen) | 'unsupported'
 */
export async function getPushStatus(kind) {
  if (!supported()) return isIOS() && !isInstalledApp() ? 'ios-install' : 'unsupported';
  const perm = Notification.permission;
  if (perm === 'denied') return 'denied';
  if (perm !== 'granted' || isOptedOut(kind)) return 'off';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// Registers this device. Asks for permission only when ask=true (must come from a tap on iPhone).
export async function enablePush(kind, { ask = false } = {}) {
  if (!supported()) return 'unsupported';
  if (!ask && isOptedOut(kind)) return 'off'; // switched off on this device: stays off until turned on again
  try {
    let perm = Notification.permission;
    if (perm === 'default' && ask) perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm;

    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const { key } = await api('/push/vapid-key');
    if (!key) return 'off';

    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
    // saved again on every open, so the server always has a live subscription for this device
    await (kind === 'seller' ? sapi : api)(`/push/${kind}/subscribe`, { method: 'POST', body: { subscription: sub.toJSON(), userAgent: navigator.userAgent } });
    setOptedOut(kind, false);
    return 'granted';
  } catch (e) {
    console.warn('push setup failed', e);
    return 'error';
  }
}

// Turns push off on THIS device only (other phones / computers keep theirs).
export async function disablePush(kind) {
  setOptedOut(kind, true);
  if (!supported()) return 'off';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await api('/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => {});
    }
  } catch (e) {
    console.warn('push off failed', e);
  }
  return 'off';
}

// Sends a test notification to this device (seller panel)
export async function testPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) throw new Error('Notifications are not on for this device yet.');
  return sapi('/push/seller/test', { method: 'POST', body: { endpoint: sub.endpoint } });
}
