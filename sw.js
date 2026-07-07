
const CACHE_NAME = 'klk-erp-v2-production';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&family=Noto+Serif+SC:wght@700;900&display=swap'
];

// 1. Install Phase: Cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Phase: Clean up old caches
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

// 3. Fetch Phase: Stale-While-Revalidate Strategy
// Serve from cache first, then update from network in background
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests like Firebase APIs or simple image loads to avoid CORS issues in simple implementation
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('cdn.tailwindcss') && !event.request.url.includes('fonts')) {
     return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Update cache with new response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
           const responseToCache = networkResponse.clone();
           caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
           });
        }
        return networkResponse;
      }).catch(() => {
         // Network failed, nothing to do (cached response already returned if avail)
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
