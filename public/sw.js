const CACHE_NAME = 'yz-erp-v7';
const FONT_CACHE = 'yz-fonts-v1';

const CRITICAL_LOCAL_ASSETS = [
  '/',
  '/manifest.json',
  '/brand/kimliankee-logo.png',
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
    // 📱 iPhone 网络卡的时候 fetch 可能拖一分钟才失败 → 画面一直白。
    //    最多等 5 秒；超时就先用缓存里的版本开起来（有缓存的话），网络回来下次再更新。
    const networkFetch = fetch(event.request);
    // 背景照样更新缓存（就算这次先用了旧版本）
    networkFetch
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
      })
      .catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
    event.respondWith(
      Promise.race([networkFetch, timeout.then(() => caches.match(event.request).then((c) => c || caches.match('/')))])
        .then((first) => first || networkFetch)
        .then((response) => response)
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('/')).then((r) => r || new Response('<h3 style="font-family:sans-serif;padding:24px">没有网络，请连线后再打开</h3>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
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
          // ⚠️ 以前这里网络失败又没缓存时回传 undefined → iPhone 上 JS 档载不到，整个 App 卡在载入中
          .catch(() => cachedResponse || Response.error());

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// 4. 驾驶舱手机推送（PR E2a）：服务端只送 data（title / body / link），这里负责显示通知。
//    推送内容只有条数与类别，不含金额；点通知打开老板入口。
self.addEventListener('push', (event) => {
  let data = {};
  try {
    const payload = event.data ? event.data.json() : {};
    data = payload.data || payload || {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : '金莲记 ERP';
  const body = typeof data.body === 'string' && data.body ? data.body : '有新的经营预警，请打开驾驶舱查看';
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/?portal=boss';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'klk-cockpit-alert',
    data: { link },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/?portal=boss';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(link).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
