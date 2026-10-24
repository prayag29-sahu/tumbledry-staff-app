// Tumbledry Operations PWA Service Worker (Network-First Auto-Updating)
const CACHE_NAME = 'tumbledry-v5';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // Pre-cache only fundamental PWA static manifests/icons
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ALL older caches immediately so stale bundles and corrupted RSC data are discarded
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. Only intercept HTTP and HTTPS GET requests (never chrome-extension://, moz-extension://, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // 2. Dynamic backend API routes, Next.js internal RSC payloads, and Webpack chunk updates:
  // ALWAYS bypass Service Worker completely so deployments and state never suffer chunk mismatch or stale deserialization errors
  if (
    url.includes('/api/') ||
    url.includes('_rsc=') ||
    url.includes('/_next/data/') ||
    url.includes('__next')
  ) {
    return;
  }

  // 3. Page Navigation / HTML Documents: NETWORK FIRST
  // Always fetch fresh HTML from the server so deployed updates appear immediately without manual hard refresh.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // If offline, fallback to cached page or cached root
          return caches.match(event.request).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // 4. Pre-cached static assets and icons: Stale-While-Revalidate
  // Only cache same-origin static assets
  const parsedUrl = new URL(url);
  if (parsedUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

