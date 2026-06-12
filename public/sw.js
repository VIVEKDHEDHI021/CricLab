self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Do not intercept non-GET requests or requests destined for /api/
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }
  // basic fetch bypass for offline/PWA install check
  e.respondWith(fetch(e.request));
});
