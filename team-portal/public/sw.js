/* Bazario Team Portal - Service Worker & Push Notification Handler */

const CACHE_NAME = 'bazario-team-v3';
// A tapped notification leaves its target here for a moment, in case the app was asleep and
// could not be told directly (iPhone). The app picks it up as soon as it is in front again.
const NAV_CACHE = 'bazario-nav-v1';
const PENDING_NAV_KEY = '/__pending-notification';
const PRECACHE_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/sounds/notification.wav',
  '/sounds/message.wav',
  '/sounds/cash.wav',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache partial failure:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== NAV_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Push notification event listener
//
// Every notification says what it is about: a chat shows WHO wrote and WHAT (like WhatsApp), and
// several messages of the same chat are stacked in one notification ("3 new messages") instead of
// a pile of separate ones. Money / approval notifications show their own title and text.
const MAX_LINES = 5;

function textOf(v, max) {
  const s = typeof v === 'string' ? v : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Bazario Team', body: event.data.text() };
    }
  }

  const info = data.data || {};
  const isChat = (info.type || data.type) === 'chat' && !!info.conversationId;
  let title = textOf(data.title, 120) || 'Bazario Team';
  let body = textOf(data.body, 300) || 'You have a new update';
  const icon = data.icon || '/icons/icon-192.png';
  const badge = data.badge || '/icons/icon-192.png';
  const sound = data.sound || '/sounds/notification.wav';
  const vibrate = data.vibrate || [200, 100, 200, 100, 200];
  const tag = isChat ? `chat-${info.conversationId}` : data.tag || `bazario-${Date.now()}`;
  const targetUrl = info.url || data.url || '/dashboard';

  // Is the portal open and in front of the person right now? Then the app itself shows the
  // message (toast + its own sound): the phone notification is still shown, but silently, so
  // the same message does not ring twice.
  const windowsP = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);

  const build = async () => {
    const windows = await windowsP;
    const inFront = windows.some((c) => c.visibilityState === 'visible' && (c.focused || c.focused === undefined));
    let lines = [];
    let count = 1;
    if (isChat) {
      // the same chat already has a notification on the screen: add this message to it
      try {
        const open = await self.registration.getNotifications({ tag });
        const prev = open.length ? open[open.length - 1].data || {} : {};
        if (Array.isArray(prev.lines)) lines = prev.lines.slice(-(MAX_LINES - 1));
        count = (Number(prev.count) || 0) + 1;
      } catch (e) {}
      const line = textOf(info.line || body, 160);
      lines.push(line);
      if (count > 1) {
        title = `${info.chatTitle || title} (${count} new messages)`;
        body = lines.join('\n');
      } else {
        title = info.chatTitle || title;
        body = line;
      }
    }

    const options = {
      body,
      icon,
      badge,
      sound,
      vibrate,
      tag,
      renotify: !inFront,
      silent: inFront,
      requireInteraction: false,
      timestamp: Date.now(),
      data: {
        url: targetUrl,
        type: info.type || 'general',
        nid: info.nid || '',
        timestamp: Date.now(),
        soundType: sound,
        conversationId: info.conversationId || '',
        chatType: info.chatType || '',
        contactId: info.contactId || '',
        chatTitle: info.chatTitle || '',
        lines,
        count,
      },
      // Buttons (Android / computer). An iPhone does not show buttons for web apps: a tap there
      // opens the chat straight away with the message box ready.
      actions: isChat
        ? [
            { action: 'reply', title: '↩ Reply' },
            { action: 'read', title: '✓ Mark as read' },
          ]
        : [{ action: 'open', title: 'Open' }],
    };
    return self.registration.showNotification(title, options);
  };

  // Tell the app, but only a window that is on screen right now. (An iPhone keeps a sleeping app's
  // messages and hands them all over when it is opened again: that is what made old
  // notifications ring again the moment the app was opened.) The time goes along so the app can
  // drop anything that arrives late anyway.
  const broadcastPromise = windowsP.then((clients) => {
    clients
      .filter((client) => client.visibilityState === 'visible')
      .forEach((client) => {
        client.postMessage({
          type: 'PUSH_NOTIFICATION_RECEIVED',
          sentAt: Date.now(),
          notification: {
            title: textOf(data.title, 120) || 'Bazario Team',
            body: textOf(info.line || data.body, 300),
            url: targetUrl,
            sound,
            dataType: info.type || data.type || 'general',
            nid: info.nid || '',
            conversationId: info.conversationId || '',
          },
        });
      });
  });

  event.waitUntil(Promise.all([build(), broadcastPromise]));
});

// "Mark as read" button: tells the portal without opening it (the sign-in cookie goes along)
async function markChatRead(info) {
  try {
    const q = new URLSearchParams({ chatType: info.chatType === 'personal' ? 'personal' : info.chatType || 'group', markOnly: '1' });
    if (info.chatType === 'personal' && info.contactId) q.set('targetMemberId', info.contactId);
    await fetch(`/api/chat?${q.toString()}`, { credentials: 'include', cache: 'no-store' });
  } catch (e) {}
}

// Notification click: bring the app to the front on the screen the notification is about.
//
// iPhone (Home Screen app) cannot be steered with `client.navigate()`, and a sleeping app may
// miss a message, so the target is delivered three ways and the app uses whichever arrives first:
//   1. kept for a moment in a small cache the app reads when it comes to the front
//   2. sent to the open app as a message (the app then moves to that screen itself)
//   3. if the app is not open at all, it is opened directly on that screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const info = event.notification.data || {};
  if (event.action === 'read' && info.conversationId) {
    event.waitUntil(markChatRead(info));
    return;
  }
  let targetUrl = info.url || '/dashboard';
  // a chat notification opens that chat with the message box ready (Reply button, or a tap)
  if (info.conversationId && targetUrl.startsWith('/chat') && !/[?&]reply=1/.test(targetUrl)) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'reply=1';
  }
  try {
    // only screens of this app
    const u = new URL(targetUrl, self.location.origin);
    targetUrl = u.origin === self.location.origin ? u.pathname + u.search + u.hash : '/dashboard';
  } catch (e) {
    targetUrl = '/dashboard';
  }
  const click = { url: targetUrl, nid: info.nid || '', id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };

  const remember = caches
    .open(NAV_CACHE)
    .then((cache) => cache.put(PENDING_NAV_KEY, new Response(JSON.stringify(click), { headers: { 'Content-Type': 'application/json' } })))
    .catch(() => {});

  const open = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
    const mine = clientList.filter((c) => c.url && c.url.startsWith(self.location.origin));
    const client = mine.find((c) => c.focused) || mine.find((c) => c.visibilityState === 'visible') || mine[0];

    if (client) {
      try {
        client.postMessage({ type: 'NOTIFICATION_CLICK', click });
      } catch (e) {}
      try {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      } catch (e) {
        // could not bring it forward: open it below
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  });

  event.waitUntil(Promise.all([remember, open]));
});
