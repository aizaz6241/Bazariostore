import { api, sapi } from '../api.js';

// Phone / desktop push for the store app. kind = 'admin' | 'seller'.
const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}

export function pushState() {
  if (!supported()) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

// Registers this device. Asks for permission only when ask=true (must come from a tap on iPhone).
export async function enablePush(kind, { ask = false } = {}) {
  if (!supported()) return 'unsupported';
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
    return 'granted';
  } catch (e) {
    console.warn('push setup failed', e);
    return 'error';
  }
}
