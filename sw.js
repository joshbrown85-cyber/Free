// Free service worker.
// Cache-first for the app shell so it works fully offline once installed.
// The only network call the app ever makes is Learn's article search
// (/.netlify/functions/api?action=search) — that is left to pass through
// and is expected to fail gracefully when offline.

const CACHE_NAME = 'free-cache-v6';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './assets/fonts.css',
  './assets/fonts/fraunces-wght.woff2',
  './assets/fonts/inter-wght.woff2',
  './assets/fonts/jetbrains-mono-400.woff2',
  './assets/fonts/jetbrains-mono-500.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache the search API — always hit the network, let the app handle failure.
  if (request.url.indexOf('/.netlify/functions/') !== -1) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.status === 200 && request.url.startsWith(self.location.origin)) {
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
