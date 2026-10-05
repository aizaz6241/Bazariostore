/* Bazario Team Portal - Service Worker & Push Notification Handler */

const CACHE_NAME = 'bazario-team-v1';
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
          if (key !== CACHE_NAME) {
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
  const targetUrl = data.data?.url || '/dashboard';

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

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
