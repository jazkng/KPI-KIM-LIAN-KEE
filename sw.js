const CACHE_NAME = 'yz-erp-v3-production';

const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&family=Noto+Serif+SC:wght@700;900&display=swap'
];

// 1. Install Phase: Cache initial assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching initial static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. Activate Phase: Clean up old caches completely
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Phase: Custom Strategies
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Do not cache Firebase APIs, Auth endpoints, or cloud operations
  if (url.pathname.startsWith('/api') || url.hostname.includes('firebase') || url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')) {
    return;
  }

  // Exclude tailwind CDN entirely
  if (url.hostname.includes('cdn.tailwindcss.com')) {
    return;
  }

  // Network-First for index.html or root to prevent old HTML pairing with new compiled JS
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
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
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-First or Stale-While-Revalidate for JS, CSS, fonts, and images
  const isLocalAsset = url.origin === self.location.origin;
  const isGoogleFont = url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic');
  const isImageOrStatic = /\.(png|jpg|jpeg|gif|svg|ico|webp|js|css|json)$/i.test(url.pathname);

  if (isLocalAsset || isGoogleFont || isImageOrStatic) {
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
