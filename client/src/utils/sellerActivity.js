import { useEffect, useRef } from 'react';
import { sapi, getApiBase } from '../api.js';

/**
 * SELLER ACTIVITY SIGNAL (seller app → admin panel's "Activity & Devices").
 * When a seller page opens, and every 2 minutes while it is on screen, the app tells the server
 * "this device is here, on this page". Nothing is shown to the seller; a failed signal is ignored.
 */

const KEY = 'bz_device_id';
const OK_ID = /^[A-Za-z0-9_-]{8,64}$/;
const EVERY_MS = 2 * 60 * 1000;

export function sellerDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !OK_ID.test(id)) {
      const rnd = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}${Math.random()}${Math.random()}`;
      id = `d${rnd.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

const PAGE_NAMES = {
  '/seller': 'Dashboard',
  '/seller/treasury': 'Treasury (add products)',
  '/seller/products': 'My Store Products',
  '/seller/orders': 'Orders',
  '/seller/refunds': 'Refunds',
  '/seller/discounts': 'Discounts / Coupons',
  '/seller/analytics': 'Analytics',
  '/seller/wallet': 'Wallet',
  '/seller/shipping': 'Shipping',
  '/seller/support': 'Support Chat',
  '/seller/settings': 'Store Settings',
  '/seller/diamond': 'Diamond Upgrade',
  '/seller/health': 'Account Health',
  '/seller/close-store': 'Close Store',
};
const pageNameOf = (path) => PAGE_NAMES[String(path || '').replace(/\/+$/, '') || '/'] || path;

// the real phone model (Chrome on Android hides it in the user agent), asked once
let model = '';
try {
  navigator.userAgentData
    ?.getHighEntropyValues?.(['model'])
    .then((v) => {
      model = String(v?.model || '').slice(0, 60);
    })
    .catch(() => {});
} catch {
  /* not available */
}

function info(page) {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    /* ignore */
  }
  return {
    deviceId: sellerDeviceId(),
    page,
    pageName: pageNameOf(page),
    tz,
    lang: navigator.language || '',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    model,
    app: window.Capacitor?.isNativePlatform?.() ? 'android' : 'web',
    visible: document.visibilityState !== 'hidden',
  };
}

function ping(page) {
  if (!localStorage.getItem('ng_seller_token')) return;
  // a 401 here (all devices signed out by the team) signs this device out like any other request
  sapi('/seller-activity/ping', { method: 'POST', body: info(page), timeout: 15000 }).catch(() => {});
}

/** Used once in the seller layout. */
export function useSellerActivity(token, pathname) {
  const pageRef = useRef(pathname);
  pageRef.current = pathname;

  // page opened / changed
  useEffect(() => {
    if (!token) return undefined;
    const t = setTimeout(() => ping(pathname), 700);
    return () => clearTimeout(t);
  }, [token, pathname]);

  // "still here" every 2 minutes while on screen; one signal when the tab is hidden / shown again
  useEffect(() => {
    if (!token) return undefined;
    const iv = setInterval(() => {
      if (document.visibilityState !== 'hidden') ping(pageRef.current);
    }, EVERY_MS);
    const onVis = () => ping(pageRef.current);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token]);
}

/** Called just before the seller's token is removed on logout. */
export function sellerActivityLogout() {
  try {
    const token = localStorage.getItem('ng_seller_token');
    const deviceId = sellerDeviceId();
    if (!token || !deviceId) return;
    const base = getApiBase();
    fetch(`${base ? `${base}/api` : '/api'}/seller-activity/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
