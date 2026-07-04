
var _cacheName = 'zhediankuaichuan-recv-v0.6.6-zd15d-42-camera-cover1';
var _cacheFiles = [
  '/',
  '/app-shell.css',
  '/app-shell.js',
  '/index.html',
  '/recv.html',
  '/cimbar_js.2026-05-09T0146.js',
  '/cimbar_js.2026-05-09T0146.wasm',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-512x512-maskable.png',
  '/recv.2026-05-09T0146.js',
  '/recv-worker.2026-05-09T0146.js',
  '/pwa-recv.2026-05-09T0146.json',
  '/zstd.2026-05-09T0146.js'
];

// fetch files
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(_cacheName).then(function (cache) {
      return cache.addAll(_cacheFiles);
    })
  );
  self.skipWaiting();
});

// serve from cache
self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (response) {
      return response || fetch(e.request);
    })
  );
});

// clean old caches
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (cn) {
          if (cn !== _cacheName) {
            return caches.delete(cn);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});
