// Bazario PWA Service Worker (v11 - push notifications)
const CACHE_NAME = 'bazario-cache-v11';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

// Install Event — immediately activate new worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate Event — purge all previous cache versions immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Network First everywhere on dev/localhost, Cache First for static images in production
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests, API calls, and socket.io
  if (request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // Bypass cache completely for localhost / 127.0.0.1 (Live development)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(request));
    return;
  }

  // Production: Static assets (images, fonts, svg, icons): Cache first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|eot|ico)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Production: HTML pages / JS / CSS: Network first, fall back to cached index.html
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match('/index.html');
        });
      })
  );
});


// ─── Push notifications (admin + seller phones) ───
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Bazario', body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Bazario';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: d.icon || '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      vibrate: [200, 100, 200],
      data: { url: d.url || '/' },
    })
  );
});

// Tap on a notification: open (or focus) the app on the page it is about
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          return c.focus().then(() => (c.navigate ? c.navigate(target) : null));
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : null;
    })
  );
});
