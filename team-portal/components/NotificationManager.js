'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useRealtime, useRealtimeEvent } from './RealtimeProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { Bell, BellOff, Volume2, VolumeX, CheckCircle, AlertCircle, X } from 'lucide-react';

const NotificationContext = createContext({
  permission: 'default',
  isSubscribed: false,
  soundEnabled: true,
  setSoundEnabled: () => {},
  enableNotifications: async () => {},
  sendTestPush: async () => {},
  playMessageSound: () => {},
  playCashSound: () => {},
  playNotificationSound: () => {},
  unreadChatCount: 0,
  refreshUnreadChatCount: () => {},
  notifications: [],
  unreadNotificationCount: 0,
  refreshNotifications: () => {},
  openNotification: () => {},
  markAllNotificationsRead: () => {},
});

// Where a tapped phone notification leaves its target when the app was asleep (see public/sw.js)
const NAV_CACHE = 'bazario-nav-v1';
const PENDING_NAV_KEY = '/__pending-notification';
const PENDING_NAV_MAX_AGE_MS = 2 * 60 * 1000;

// Helper to convert base64 VAPID key to Uint8Array for pushManager
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  // In-app notifications while the portal is in use: a small stack at the top (newest first)
  const [toasts, setToasts] = useState([]); // [{ id, title, body, url, type, count }]
  const toastTimers = useRef(new Map());
  const recentUrlRef = useRef(new Map()); // url -> when a toast for it was shown (no double toasts)
  const recentNidRef = useRef(new Map()); // notification id -> when it was shown as a toast
  const lastSoundRef = useRef(0);
  const [loadingAction, setLoadingAction] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(() => {
    return readCache('portal_total_unread_chat') || 0;
  });

  const audioCache = useRef({});
  const audioCtxRef = useRef(null);

  // ─── Notification list (the bell) ───
  const notifCacheKey = `notifications_${user?._id || ''}`;
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const lastNotifFetchRef = useRef(0);
  const notifTimerRef = useRef(null);
  const handledClicksRef = useRef(new Set());

  const applyNotifications = useCallback(
    (data) => {
      if (!data || !Array.isArray(data.items)) return;
      setNotifications(data.items);
      setUnreadNotificationCount(Number(data.unread) || 0);
      writeCache(notifCacheKey, { items: data.items, unread: Number(data.unread) || 0 });
    },
    [notifCacheKey]
  );

  // New lines in the bell since the last look: shown as a toast while the portal is in use.
  // The first look (opening the app, coming back to it) only takes note of what is there: those
  // were already seen as phone notifications, so they do not ring again.
  const seenRef = useRef(new Map()); // notification id -> lastAt
  const baselineRef = useRef(true);
  const showToastRef = useRef(null);
  const chimeRef = useRef(null);
  const isOpenChatRef = useRef(() => false);
  const announceNew = (data) => {
    const items = Array.isArray(data?.items) ? data.items : [];
    const key = (n) => String(n.lastAt || '');
    if (baselineRef.current) {
      seenRef.current = new Map(items.map((n) => [String(n._id), key(n)]));
      baselineRef.current = false;
      return;
    }
    const now = Date.now();
    const fresh = items.filter((n) => !n.readAt && seenRef.current.get(String(n._id)) !== key(n) && now - new Date(n.lastAt).getTime() < 3 * 60000);
    items.forEach((n) => seenRef.current.set(String(n._id), key(n)));
    if (typeof document !== 'undefined' && document.hidden) return;
    let rang = false;
    for (const n of fresh.slice(0, 3).reverse()) {
      const nidAt = recentNidRef.current.get(String(n._id));
      if (nidAt && now - nidAt < 60000) continue; // already shown when the push arrived
      if (isOpenChatRef.current(n.url)) continue;
      const urlAt = n.url ? recentUrlRef.current.get(n.url) : null;
      if (urlAt && now - urlAt < 15000) continue; // the live message was already shown
      showToastRef.current?.({ title: n.title, body: n.body, url: n.url, type: n.type, merge: false });
      if (!rang) {
        chimeRef.current?.(n.type === 'finance' ? 'cash' : n.type === 'chat' ? 'message' : 'notification', n.url);
        rang = true;
      }
    }
  };

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('portal_token');
      if (!token) return;
      lastNotifFetchRef.current = Date.now();
      const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        announceNew(data);
        applyNotifications(data);
      }
    } catch (_) {}
  }, [user, applyNotifications]); // eslint-disable-line react-hooks/exhaustive-deps

  // Several things can ask for a refresh at the same moment: one request a little later is enough
  const refreshNotificationsSoon = useCallback(
    (delay = 1500) => {
      clearTimeout(notifTimerRef.current);
      notifTimerRef.current = setTimeout(() => {
        if (!document.hidden) refreshNotifications();
      }, delay);
    },
    [refreshNotifications]
  );

  const markNotificationsRead = useCallback(
    async (ids) => {
      const list = (ids || []).filter(Boolean).map(String);
      if (!list.length) return;
      // shown as read at once; the server answer then confirms it
      setNotifications((prev) => prev.map((n) => (list.includes(String(n._id)) && !n.readAt ? { ...n, readAt: new Date().toISOString(), count: 0 } : n)));
      setUnreadNotificationCount((c) => Math.max(0, c - 1));
      try {
        const token = localStorage.getItem('portal_token');
        const res = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'read', ids: list }),
        });
        if (res.ok) applyNotifications(await res.json());
      } catch (_) {}
    },
    [applyNotifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString(), count: 0 })));
    setUnreadNotificationCount(0);
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'read_all' }),
      });
      if (res.ok) applyNotifications(await res.json());
    } catch (_) {}
  }, [applyNotifications]);

  // Go to the screen a notification is about (a chat link opens that exact conversation)
  const goTo = useCallback(
    (url) => {
      const dest = typeof url === 'string' && url.startsWith('/') ? url : '/dashboard';
      if (typeof window !== 'undefined' && window.location.pathname + window.location.search === dest) return;
      // Already on the chat screen: it opens the conversation itself (and keeps "back" = chat list)
      if (typeof window !== 'undefined' && window.location.pathname === '/chat' && dest.startsWith('/chat?')) {
        window.dispatchEvent(new CustomEvent('portal_open_chat_url', { detail: { url: dest } }));
        return;
      }
      try {
        router.push(dest);
      } catch (_) {
        if (typeof window !== 'undefined') window.location.href = dest;
      }
    },
    [router]
  );

  // Is this chat link the conversation that is open on the screen right now?
  const isOpenChat = useCallback((url) => {
    if (typeof window === 'undefined' || window.location.pathname !== '/chat' || !String(url || '').startsWith('/chat?')) return false;
    try {
      const now = new URLSearchParams(window.location.search);
      const it = new URLSearchParams(String(url).slice(String(url).indexOf('?')));
      if (!now.get('chatType')) return false; // the chat list, no conversation open
      return now.get('chatType') === it.get('chatType') && (now.get('contactId') || '') === (it.get('contactId') || '');
    } catch (_) {
      return false;
    }
  }, []);

  const dropToast = useCallback((id) => {
    clearTimeout(toastTimers.current.get(id));
    toastTimers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /**
   * Show something that just came in. Several messages of the same chat within a few seconds
   * become one toast ("3 new messages") instead of a pile.
   */
  const toastsRef = useRef([]);
  toastsRef.current = toasts;
  const armToast = useCallback(
    (id) => {
      clearTimeout(toastTimers.current.get(id));
      toastTimers.current.set(
        id,
        setTimeout(() => dropToast(id), 6500)
      );
    },
    [dropToast]
  );
  const showToast = useCallback(
    (t) => {
      if (!t || !t.title) return false;
      const now = Date.now();
      const url = t.url || '';
      const key = url || `${t.title}|${t.body}`;
      const before = recentUrlRef.current.get(key);
      recentUrlRef.current.set(key, now);
      if (recentUrlRef.current.size > 200) recentUrlRef.current.delete(recentUrlRef.current.keys().next().value);
      const list = toastsRef.current;
      const existing = url && before && now - before < 8000 ? list.find((x) => x.url === url) : null;
      let next;
      let id;
      if (existing) {
        id = existing.id;
        const updated = { ...existing, title: t.title || existing.title, body: t.body || existing.body, count: (existing.count || 1) + (t.merge === false ? 0 : 1) };
        next = [updated, ...list.filter((x) => x.id !== id)];
      } else {
        id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
        next = [{ id, title: t.title, body: t.body || '', url, type: t.type || 'general', count: 1 }, ...list].slice(0, 3);
      }
      toastsRef.current = next;
      setToasts(next);
      armToast(id);
      return true;
    },
    [armToast]
  );

  // Tapped in the bell list: mark it read and open what it is about
  const openNotification = useCallback(
    (n) => {
      if (!n) return;
      if (!n.readAt) markNotificationsRead([n._id]);
      goTo(n.url);
    },
    [markNotificationsRead, goTo]
  );

  // A phone / desktop notification was tapped
  const handleNotificationClick = useCallback(
    (click) => {
      if (!click || !click.url) return;
      if (click.id) {
        if (handledClicksRef.current.has(click.id)) return;
        handledClicksRef.current.add(click.id);
      }
      setToasts([]);
      if (click.nid) markNotificationsRead([click.nid]);
      else refreshNotificationsSoon(800);
      goTo(click.url);
    },
    [markNotificationsRead, refreshNotificationsSoon, goTo]
  );

  // The app came to the front: was it opened by tapping a notification while it was asleep?
  const consumePendingClick = useCallback(async () => {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    try {
      const cache = await caches.open(NAV_CACHE);
      const hit = await cache.match(PENDING_NAV_KEY);
      if (!hit) return;
      const click = await hit.json().catch(() => null);
      await cache.delete(PENDING_NAV_KEY);
      if (!click || Date.now() - (click.at || 0) > PENDING_NAV_MAX_AGE_MS) return;
      handleNotificationClick(click);
    } catch (_) {}
  }, [handleNotificationClick]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return undefined;
    }
    const saved = readCache(notifCacheKey);
    if (saved && Array.isArray(saved.items)) {
      setNotifications(saved.items);
      setUnreadNotificationCount(Number(saved.unread) || 0);
    }
    baselineRef.current = true;
    refreshNotifications();
    consumePendingClick();

    const timer = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastNotifFetchRef.current >= 45000) refreshNotifications();
    }, 15000);
    const onFront = () => {
      if (document.hidden) {
        // whatever arrives while the app is away is seen as a phone notification
        baselineRef.current = true;
        return;
      }
      consumePendingClick();
      refreshNotifications();
    };
    document.addEventListener('visibilitychange', onFront);
    window.addEventListener('focus', onFront);
    window.addEventListener('pageshow', onFront);
    return () => {
      clearInterval(timer);
      clearTimeout(notifTimerRef.current);
      document.removeEventListener('visibilitychange', onFront);
      window.removeEventListener('focus', onFront);
      window.removeEventListener('pageshow', onFront);
    };
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: while the server pushes chat news, the badge is kept up to date by those pushes
  const pathname = usePathname();
  const onChatPageRef = useRef(false);
  onChatPageRef.current = pathname === '/chat'; // the chat page keeps the badge itself
  const realtime = useRealtime();
  const pushedRef = useRef(false);
  pushedRef.current = !!realtime.status.chat;
  const lastUnreadFetchRef = useRef(0);

  const refreshUnreadChatCount = useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('portal_token');
      if (!token) return;
      lastUnreadFetchRef.current = Date.now();
      const res = await fetch('/api/chat/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const total = typeof data.totalUnreadCount === 'number' ? data.totalUnreadCount : 0;
        setUnreadChatCount(total);
        writeCache('portal_total_unread_chat', total);
      }
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    refreshUnreadChatCount();
    const timer = setInterval(() => {
      if (document.hidden || !user) return;
      // the chat page loads the same list itself and reports the total (see `chat_unread_updated`)
      if (onChatPageRef.current) return;
      // pushed by the server: only a slow safety check
      if (pushedRef.current && Date.now() - lastUnreadFetchRef.current < 60000) return;
      refreshUnreadChatCount();
    }, 8000);
    const onVis = () => {
      if (!document.hidden && user) refreshUnreadChatCount();
    };
    document.addEventListener('visibilitychange', onVis);

    const onCustomUpdate = (e) => {
      if (typeof e.detail === 'number') {
        setUnreadChatCount(e.detail);
        writeCache('portal_total_unread_chat', e.detail);
      } else {
        refreshUnreadChatCount();
      }
    };
    window.addEventListener('chat_unread_updated', onCustomUpdate);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('chat_unread_updated', onCustomUpdate);
    };
  }, [user, refreshUnreadChatCount]);

  // A message was pushed while the user is on another page: the badge goes up at once
  useRealtimeEvent('chat:message', (payload) => {
    if (onChatPageRef.current || !user) return;
    if (String(payload?.message?.senderId || '') === String(user._id)) return;
    setUnreadChatCount((n) => {
      const next = (Number(n) || 0) + 1;
      writeCache('portal_total_unread_chat', next);
      return next;
    });
  });
  // Something happened that usually comes with a notification: bring the bell list up to date
  useRealtimeEvent('chat:message', (payload) => {
    if (!user || String(payload?.message?.senderId || '') === String(user._id)) return;
    refreshNotificationsSoon(2000);
    // and show it at once (the phone notification comes a moment later, or not at all on a computer)
    const m = payload?.message || {};
    const conv = String(payload?.conversationId || m.conversationId || '');
    if (!conv || document.hidden) return;
    const preview = m.isDeleted
      ? 'Message deleted'
      : m.messageType === 'image'
      ? `📷 ${m.text ? String(m.text).slice(0, 80) : 'Photo'}`
      : m.messageType === 'file'
      ? `📄 ${m.fileName || 'PDF'}`
      : m.messageType === 'voice'
      ? '🎤 Voice message'
      : String(m.text || '').slice(0, 160);
    let t;
    if (conv === 'main_group') t = { title: '👥 Team group', body: `${m.senderName || 'Someone'}: ${preview}`, url: '/chat?chatType=group' };
    else if (conv === 'materials_group') t = { title: '📁 Materials Group', body: `${m.senderName || 'Admin'}: ${preview}`, url: '/chat?chatType=materials' };
    else if (conv.startsWith('personal_')) {
      const other = conv.replace(/^personal_/, '').split('_').find((x) => x !== String(user._id)) || String(m.senderId || '');
      t = { title: `💬 ${m.senderName || 'Message'}`, body: preview, url: `/chat?chatType=personal&contactId=${other}` };
    }
    if (!t || isOpenChat(t.url)) return;
    showToast({ ...t, type: 'chat' });
    chime('message', t.url);
  });
  useRealtimeEvent('live:changed', () => refreshNotificationsSoon(2500));

  // The channel was (re)opened: count again once
  useRealtimeEvent('resync', () => {
    if (onChatPageRef.current || document.hidden) return;
    if (Date.now() - lastUnreadFetchRef.current > 5000) refreshUnreadChatCount();
  });

  // Initialize sound settings & audio objects
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedSound = localStorage.getItem('portal_sound_enabled');
    if (savedSound !== null) {
      setSoundEnabledState(savedSound === 'true');
    }

    if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'default') {
        const dismissed = sessionStorage.getItem('portal_notif_prompt_dismissed');
        if (!dismissed) {
          setShowPromptBanner(true);
        }
      }
    }

    // Preload audio files
    try {
      audioCache.current.message = new Audio('/sounds/message.wav');
      audioCache.current.cash = new Audio('/sounds/cash.wav');
      audioCache.current.notification = new Audio('/sounds/notification.wav');
    } catch (e) {
      console.warn('Audio preloading not supported:', e);
    }
  }, []);

  const setSoundEnabled = (val) => {
    setSoundEnabledState(val);
    localStorage.setItem('portal_sound_enabled', String(val));
  };

  // Web Audio API synthesizer fallback
  const playSynthesizedChime = useCallback((type) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      if (type === 'cash') {
        // Sparkling cash register arpeggio: C6, E6, G6, C7
        const freqs = [1046.5, 1318.5, 1567.9, 2093.0];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          gain.gain.setValueAtTime(0.3, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.35);
        });
      } else if (type === 'message') {
        // WhatsApp style 2-tone melodic blip: G5 -> C6
        const notes = [
          { f: 784, t: 0, d: 0.12, v: 0.4 },
          { f: 1046.5, t: 0.08, d: 0.25, v: 0.5 },
        ];
        notes.forEach(({ f, t, d, v }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + t);

          gain.gain.setValueAtTime(v, now + t);
          gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + t);
          osc.stop(now + t + d);
        });
      } else {
        // General notification chime: A5 -> E6
        const notes = [
          { f: 880, t: 0, d: 0.14, v: 0.35 },
          { f: 1318.5, t: 0.11, d: 0.35, v: 0.45 },
        ];
        notes.forEach(({ f, t, d, v }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + t);

          gain.gain.setValueAtTime(v, now + t);
          gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + t);
          osc.stop(now + t + d);
        });
      }
    } catch (err) {
      console.warn('Web Audio synthesis failed:', err);
    }
  }, []);

  const playSound = useCallback(
    (type = 'message') => {
      if (!soundEnabled) return;

      // Trigger mobile vibration pattern
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          if (type === 'cash') {
            navigator.vibrate([250, 100, 250, 100, 250]);
          } else {
            navigator.vibrate([150, 80, 150]);
          }
        } catch (_) {}
      }

      // Try audio file element
      const soundFile = audioCache.current[type];
      if (soundFile) {
        soundFile.currentTime = 0;
        soundFile
          .play()
          .catch(() => {
            // Autoplay restriction or network error -> fallback to Web Audio
            playSynthesizedChime(type);
          });
      } else {
        playSynthesizedChime(type);
      }
    },
    [soundEnabled, playSynthesizedChime]
  );

  const playMessageSound = useCallback(() => playSound('message'), [playSound]);
  const playCashSound = useCallback(() => playSound('cash'), [playSound]);
  const playNotificationSound = useCallback(() => playSound('notification'), [playSound]);

  // One sound per thing that came in (the live message and its push arrive a moment apart)
  const chimedRef = useRef(new Map());
  const chime = useCallback(
    (type = 'message', url = '') => {
      const now = Date.now();
      if (now - lastSoundRef.current < 1200) return;
      if (url && now - (chimedRef.current.get(url) || 0) < 6000) return;
      lastSoundRef.current = now;
      if (url) chimedRef.current.set(url, now);
      playSound(type);
    },
    [playSound]
  );
  chimeRef.current = chime;
  showToastRef.current = showToast;
  isOpenChatRef.current = isOpenChat;

  // The number on the app icon (iPhone / Android Home Screen app): unread chats + other alerts
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const others = notifications.filter((n) => !n.readAt && n.type !== 'chat').length;
    const n = (Number(unreadChatCount) || 0) + others;
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {});
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch (_) {}
  }, [unreadChatCount, notifications]);

  // Subscribe device to server push notifications
  const subscribeDevice = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging not supported by this browser');
      return false;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Fetch VAPID key
        const keyRes = await fetch('/api/push/vapid-key');
        if (!keyRes.ok) throw new Error('Failed to fetch VAPID key');
        const { publicKey } = await keyRes.json();

        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const token = localStorage.getItem('portal_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to subscribe device to push:', err);
      return false;
    }
  }, []);

  // Check existing ServiceWorker & push status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // pick up a newer notification handler without waiting for the browser's own check
          try {
            reg.update();
          } catch (_) {}
          // If already granted, ensure push subscription is active on server
          if (Notification.permission === 'granted' && user) {
            reg.pushManager.getSubscription().then((sub) => {
              if (sub) {
                setIsSubscribed(true);
                // Refresh server record
                subscribeDevice();
              } else {
                subscribeDevice();
              }
            });
          }
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });

      // Listen for push notifications while in foreground
      const handleSwMessage = (event) => {
        if (event.data?.type === 'PUSH_NOTIFICATION_RECEIVED') {
          const notif = event.data.notification || {};
          refreshUnreadChatCount();
          refreshNotificationsSoon(1200);
          // Only something that arrives now, while the portal is on screen. (Messages kept by the
          // phone while the app slept are old news: the person already saw them on the lock screen.)
          const late = event.data.sentAt && Date.now() - event.data.sentAt > 10000;
          if (document.hidden || late) return;
          // the conversation open on the screen shows (and chimes) its own messages
          if (isOpenChat(notif.url)) return;
          if (notif.nid) recentNidRef.current.set(String(notif.nid), Date.now());
          showToast({ title: notif.title, body: notif.body, url: notif.url, type: notif.dataType });
          chime(notif.dataType === 'finance' ? 'cash' : notif.dataType === 'chat' ? 'message' : 'notification');
        } else if (event.data?.type === 'NOTIFICATION_CLICK') {
          // a phone / desktop notification was tapped: open what it is about
          handleNotificationClick(event.data.click);
          if (typeof caches !== 'undefined') {
            caches
              .open(NAV_CACHE)
              .then((c) => c.delete(PENDING_NAV_KEY))
              .catch(() => {});
          }
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, [user, playSound, subscribeDevice, handleNotificationClick, refreshNotificationsSoon, isOpenChat, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request permission and subscribe
  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Notifications are not supported by this browser.');
      return;
    }

    setLoadingAction(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        setShowPromptBanner(false);
        const ok = await subscribeDevice();
        if (ok) {
          playNotificationSound();
          showToast({
            title: '🔔 Notifications are on',
            body: 'You will get a notification for team messages, deposits, payouts and approvals.',
            url: '',
            type: 'success',
          });
        }
      } else {
        alert('Notification permission was blocked. Please enable notifications in your browser settings.');
      }
    } catch (err) {
      console.error('Error enabling notifications:', err);
    } finally {
      setLoadingAction(false);
    }
  };

  // Send a test push notification to this user
  const sendTestPush = async (type = 'message') => {
    setLoadingAction(true);
    try {
      const token = localStorage.getItem('portal_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({ type }),
      });

      const data = await res.json();
      if (res.ok) {
        // Also play in-app sound immediately so user gets feedback
        if (type === 'money') {
          playCashSound();
        } else {
          playMessageSound();
        }
        showToast({
          title: type === 'money' ? '💰 Test Deposit Alert' : '💬 Test Message Notification',
          body: data.message,
          url: type === 'money' ? '/wallet' : '/chat',
          type: 'info',
        });
      } else {
        alert(data.message || 'Failed to send test push.');
      }
    } catch (err) {
      console.error('Test push failed:', err);
      alert('Failed to send test notification');
    } finally {
      setLoadingAction(false);
    }
  };



  return (
    <NotificationContext.Provider
      value={{
        permission,
        isSubscribed,
        soundEnabled,
        setSoundEnabled,
        enableNotifications,
        sendTestPush,
        playMessageSound,
        playCashSound,
        playNotificationSound,
        unreadChatCount,
        refreshUnreadChatCount,
        notifications,
        unreadNotificationCount,
        refreshNotifications,
        openNotification,
        markAllNotificationsRead,
      }}
    >
      {children}

      {/* Enable Notification Banner (Android / Chrome prompt) */}
      {showPromptBanner && permission !== 'granted' && (
        <div className="fixed bottom-20 lg:bottom-4 left-4 right-4 max-w-md mx-auto z-50 bg-slate-900/95 backdrop-blur-md border border-amber-500/30 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-100">Enable Mobile Notifications</div>
              <div className="text-slate-400 text-[11px] leading-tight">
                Get sound alerts for chat messages, deposits & bonuses!
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={enableNotifications}
              disabled={loadingAction}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {loadingAction ? 'Enabling…' : 'Enable'}
            </button>
            <button
              onClick={() => {
                setShowPromptBanner(false);
                sessionStorage.setItem('portal_notif_prompt_dismissed', '1');
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* What just came in, while the portal is in use (also kept in the bell) */}
      {toasts.length > 0 && (
        <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-[380px] z-[1100] space-y-2 pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top)' }} aria-live="polite">
          {toasts.map((t) => {
            const icon = t.type === 'finance' ? '💰' : t.type === 'chat' ? '💬' : t.type === 'chat_request' ? '🔐' : t.type === 'approval' ? '✅' : t.type === 'success' ? '✅' : '🔔';
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (t.url) goTo(t.url);
                  refreshNotificationsSoon(1500);
                  dropToast(t.id);
                }}
                onMouseEnter={() => clearTimeout(toastTimers.current.get(t.id))}
                onMouseLeave={() => armToast(t.id)}
                className="pointer-events-auto cursor-pointer bg-slate-900/95 backdrop-blur-md border border-white/10 text-white p-3 rounded-2xl shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 hover:border-emerald-400/60 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-base">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-white truncate">
                    {t.title}
                    {t.count > 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-[10px]">{t.count} new</span>}
                  </div>
                  {t.body && <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-2 break-words">{t.body}</div>}
                  <div className="text-[10px] text-emerald-300/90 mt-1 font-semibold">{t.url ? 'Tap to open' : 'Saved in the bell'}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dropToast(t.id);
                  }}
                  className="p-1 text-slate-400 hover:text-white shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
