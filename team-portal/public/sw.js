/* Bazario Team Portal - Service Worker & Push Notification Handler */

const CACHE_NAME = 'bazario-team-v1';
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
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Bazario Team', body: event.data.text() };
    }
  }

  const title = data.title || 'Bazario Team Notification';
  const body = data.body || 'You have a new update';
  const icon = data.icon || '/icons/icon-192.png';
  const badge = data.badge || '/icons/icon-192.png';
  const sound = data.sound || '/sounds/notification.wav';
  const vibrate = data.vibrate || [200, 100, 200, 100, 200];
  const tag = data.tag || `bazario-${Date.now()}`;
  const targetUrl = data.data?.url || data.url || '/dashboard';

  const notificationOptions = {
    body,
    icon,
    badge,
    sound,
    vibrate,
    tag,
    renotify: true,
    requireInteraction: false,
    data: {
      url: targetUrl,
      type: data.data?.type || 'general',
      nid: data.data?.nid || '',
      timestamp: Date.now(),
      soundType: data.sound || '/sounds/notification.wav',
    },
    actions: [
      { action: 'open', title: 'Open View' },
    ],
  };

  // Broadcast to any open windows so in-app sound and live updates trigger immediately
  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_NOTIFICATION_RECEIVED',
        notification: {
          title,
          body,
          url: targetUrl,
          sound,
          dataType: data.data?.type,
        },
      });
    });
  });

  const showPromise = self.registration.showNotification(title, notificationOptions);

  event.waitUntil(Promise.all([showPromise, broadcastPromise]));
});

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
  let targetUrl = info.url || '/dashboard';
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
