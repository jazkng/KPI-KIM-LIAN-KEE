const CACHE_NAME = 'yz-erp-v5';
const FONT_CACHE = 'yz-fonts-v1';

const CRITICAL_LOCAL_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

const OPTIONAL_EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&family=Noto+Serif+SC:wght@700;900&display=swap'
];

// 1. Install Phase: Cache core local assets, individually handle external assets without blocking install
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching critical local assets');
      try {
        await cache.addAll(CRITICAL_LOCAL_ASSETS);
      } catch (err) {
        console.warn('[SW] Non-critical error caching local assets during install:', err);
      }

      // Cache external assets individually so failures never break SW installation
      for (const assetUrl of OPTIONAL_EXTERNAL_ASSETS) {
        try {
          await cache.add(assetUrl);
        } catch (fontErr) {
          console.warn('[SW] External asset caching bypassed during SW install:', assetUrl, fontErr);
        }
      }
    })
  );
});

// 2. Activate Phase: Clean up old caches completely
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== FONT_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Phase: Custom Non-blocking Strategies
self.addEventListener('fetch', (event) => {
  // Never cache non-GET requests (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Absolute passthrough for API endpoints (/api/*), Firebase, Google GenAI, and auth tokens
  if (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('firebase') ||
    (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')) ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken')
  ) {
    return;
  }

  // Network-First strategy for root navigation and HTML to ensure online updates are instant
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Handle Google Fonts separately
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(FONT_CACHE).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(FONT_CACHE).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[SW] Font fetch failed:', err);
          return new Response('', { status: 408, statusText: 'Font fetch timeout' });
        });
      })
    );
    return;
  }

  // Cache-First with Stale-While-Revalidate for local images, JS, CSS, JSON
  const isLocalAsset = url.origin === self.location.origin;
  const isStaticFile = /\.(png|jpg|jpeg|gif|svg|ico|webp|js|css|json|woff2?)$/i.test(url.pathname);

  if (isLocalAsset || isStaticFile) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
