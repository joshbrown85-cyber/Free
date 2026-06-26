// Free service worker.
// Cache-first for the app shell (so it works fully offline once installed),
// network-first fallback isn't needed since this app has no remote API
// calls of its own — all data lives in IndexedDB on-device.

const CACHE_NAME = 'free-cache-v2';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './assets/fonts.css',
  './assets/tabler-icons.css',
  './assets/fonts/fraunces-wght.woff2',
  './assets/fonts/inter-wght.woff2',
  './assets/fonts/tabler-icons.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests for our own origin's app shell.
  // Let everything else (fonts, icon font CDN, etc.) pass through normally,
  // falling back to cache if the network is unavailable.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate: serve cached copy immediately, refresh in background.
        event.waitUntil(
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh.clone()));
              }
            })
            .catch(() => {})
        );
        return cached;
      }
      return fetch(request)
        .then((fresh) => {
          if (fresh && fresh.status === 200 && request.url.startsWith(self.location.origin)) {
            const copy = fresh.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return fresh;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
