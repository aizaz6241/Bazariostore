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
});

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
  const [inAppToast, setInAppToast] = useState(null); // { title, body, url, type }
  const [loadingAction, setLoadingAction] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(() => {
    return readCache('portal_total_unread_chat') || 0;
  });

  const audioCache = useRef({});
  const audioCtxRef = useRef(null);

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
          const notif = event.data.notification;
          const soundType = notif.dataType === 'finance' ? 'cash' : 'message';
          playSound(soundType);

          setInAppToast({
            title: notif.title,
            body: notif.body,
            url: notif.url,
            type: notif.dataType,
          });
          refreshUnreadChatCount();
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, [user, playSound, subscribeDevice]);

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
          setInAppToast({
            title: '🔔 Notifications Active!',
            body: 'You will receive sound notifications for all team messages, deposits and bonuses.',
            url: '/chat',
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
        setInAppToast({
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

  // Auto-dismiss in-app toast
  useEffect(() => {
    if (!inAppToast) return;
    const timer = setTimeout(() => {
      setInAppToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [inAppToast]);

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

      {/* Foreground In-App Toast */}
      {inAppToast && (
        <div
          onClick={() => {
            const destUrl = inAppToast.url;
            if (destUrl) {
              if (typeof window !== 'undefined' && destUrl.startsWith('/chat')) {
                window.dispatchEvent(new CustomEvent('portal_open_chat_url', { detail: { url: destUrl } }));
              }
              try {
                router.push(destUrl);
              } catch (_) {
                if (typeof window !== 'undefined') window.location.href = destUrl;
              }
            }
            setInAppToast(null);
          }}
          className="fixed top-4 left-4 right-4 max-w-md mx-auto z-50 cursor-pointer bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 text-white p-3.5 rounded-2xl shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 hover:border-emerald-400 transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            {inAppToast.type === 'finance' ? (
              <span className="text-base">💰</span>
            ) : inAppToast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <Bell className="w-5 h-5 text-teal-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs text-slate-100 truncate">{inAppToast.title}</div>
            <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">{inAppToast.body}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInAppToast(null);
            }}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
